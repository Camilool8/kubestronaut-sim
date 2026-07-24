// Package control orchestrates the privileged environment operations
// the exam UI drives through the facilitator's /api/control proxy:
// resetting the exam environment (and, with a bank argument, switching
// banks). Each operation runs asynchronously as a phased job; progress
// is read back via the job store.
package control

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"kubestronaut-sim/conductor/internal/job"
)

// Engine is the slice of the Docker Engine API the controller needs.
// containerIDs returned by FindContainer are opaque to this package.
type Engine interface {
	FindContainer(ctx context.Context, project, service string) (string, error)
	Exec(ctx context.Context, containerID string, cmd []string) (exitCode int, output string, err error)
	Restart(ctx context.Context, containerID string, timeoutSec int) error
}

// Controller wires the engine, job store, and facilitator endpoint into
// runnable control operations. All fields must be set before use.
type Controller struct {
	Engine         Engine
	Store          *job.Store
	Project        string   // compose project name for container lookup
	FacilitatorURL string   // e.g. http://facilitator:8080
	Instances      []string // instance service names, in wipe/restart order
	HTTPClient     *http.Client
	VerifyBudget   time.Duration
	VerifyInterval time.Duration
}

// resetPhases is the checklist a reset job walks through, in order.
func resetPhases() []job.PhaseSpec {
	return []job.PhaseSpec{
		{ID: "end-session", Label: "End session and lock desktop"},
		{ID: "wipe-instances", Label: "Wipe instance work directories"},
		{ID: "recreate-cluster", Label: "Recreate Kubernetes cluster"},
		{ID: "restart-services", Label: "Restart exam instances"},
		{ID: "verify", Label: "Verify environment"},
	}
}

// StartReset begins an asynchronous reset job, returning the job record
// or job.ErrBusy if another operation is in flight.
func (c *Controller) StartReset() (job.Job, error) {
	j, err := c.Store.Begin("reset", "", resetPhases())
	if err != nil {
		return job.Job{}, err
	}
	go c.runReset(j.ID)
	return j, nil
}

// runReset walks the reset sequence, failing the job at the first phase
// that errors. Context: each docker call gets a generous fixed timeout;
// the overall job is bounded by the sum of its phases.
func (c *Controller) runReset(jobID string) {
	ctx := context.Background()

	c.Store.StartPhase(jobID, "end-session")
	if err := c.endSession(ctx); err != nil {
		c.Store.Fail(jobID, err.Error())
		return
	}

	c.Store.StartPhase(jobID, "wipe-instances")
	for _, inst := range c.Instances {
		if err := c.execChecked(ctx, inst, []string{"find", "/opt/course", "-mindepth", "1", "-delete"}); err != nil {
			c.Store.Fail(jobID, err.Error())
			return
		}
	}

	c.Store.StartPhase(jobID, "recreate-cluster")
	if err := c.execChecked(ctx, "k8s-env", []string{"bash", "-c", "kind delete cluster --name sim || true; /opt/sim/bootstrap.sh"}); err != nil {
		c.Store.Fail(jobID, err.Error())
		return
	}

	c.Store.StartPhase(jobID, "restart-services")
	for _, inst := range c.Instances {
		if err := c.restart(ctx, inst); err != nil {
			c.Store.Fail(jobID, err.Error())
			return
		}
	}

	c.Store.StartPhase(jobID, "verify")
	if err := c.verifyHealthy(ctx); err != nil {
		c.Store.Fail(jobID, err.Error())
		return
	}

	c.Store.Complete(jobID)
}

// endSession clears any session on the facilitator; DELETE /api/session
// succeeds (204) from every state, so this also locks the desktop the
// moment a reset begins.
func (c *Controller) endSession(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, c.FacilitatorURL+"/api/session", nil)
	if err != nil {
		return fmt.Errorf("end session: %w", err)
	}
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("end session: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("end session: facilitator returned %d", resp.StatusCode)
	}
	return nil
}

// execChecked runs cmd in the named compose service's container and
// fails on a non-zero exit, surfacing the command output (that output is
// what the UI shows on a failed phase, so it must carry the real cause).
func (c *Controller) execChecked(ctx context.Context, service string, cmd []string) error {
	id, err := c.Engine.FindContainer(ctx, c.Project, service)
	if err != nil {
		return fmt.Errorf("%s: %w", service, err)
	}
	exit, out, err := c.Engine.Exec(ctx, id, cmd)
	if err != nil {
		return fmt.Errorf("%s: exec: %w", service, err)
	}
	if exit != 0 {
		return fmt.Errorf("%s: exec exited %d: %s", service, exit, tail(out, 500))
	}
	return nil
}

func (c *Controller) restart(ctx context.Context, service string) error {
	id, err := c.Engine.FindContainer(ctx, c.Project, service)
	if err != nil {
		return fmt.Errorf("%s: %w", service, err)
	}
	if err := c.Engine.Restart(ctx, id, 10); err != nil {
		return fmt.Errorf("%s: restart: %w", service, err)
	}
	return nil
}

// verifyHealthy polls the facilitator's /healthz until it answers 200 or
// the budget elapses.
func (c *Controller) verifyHealthy(ctx context.Context) error {
	deadline := time.Now().Add(c.VerifyBudget)
	var lastErr error
	for time.Now().Before(deadline) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.FacilitatorURL+"/healthz", nil)
		if err != nil {
			return fmt.Errorf("verify: %w", err)
		}
		resp, err := c.HTTPClient.Do(req)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return nil
			}
			lastErr = fmt.Errorf("facilitator /healthz returned %d", resp.StatusCode)
		} else {
			lastErr = err
		}
		time.Sleep(c.VerifyInterval)
	}
	return fmt.Errorf("verify: facilitator not healthy within %s: %v", c.VerifyBudget, lastErr)
}

// tail returns at most the last n bytes of s — failed-phase output is
// surfaced to the UI, and the end of a build/bootstrap log is where the
// actual error lives.
func tail(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return "…" + s[len(s)-n:]
}
