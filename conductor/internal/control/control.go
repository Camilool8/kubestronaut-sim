// Package control orchestrates the privileged environment operations
// the exam UI drives through the facilitator's /api/control proxy:
// resetting the exam environment (and, with a bank argument, switching
// banks). Each operation runs asynchronously as a phased job; progress
// is read back via the job store.
package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"kubestronaut-sim/conductor/internal/catalog"
	"kubestronaut-sim/conductor/internal/job"
)

// ErrInvalidBank rejects a switch to a bank that is unknown, malformed,
// or not runnable (coming-soon / non-conforming topology). Mapped to 400.
var ErrInvalidBank = errors.New("control: invalid bank")

// ErrSessionRunning rejects a switch while an exam attempt is running —
// ending someone's timed attempt as a side effect would be hostile.
// Mapped to 409. (Reset intentionally has no such guard: it IS the
// explicit "abandon this attempt" operation.)
var ErrSessionRunning = errors.New("control: a session is running — end the exam first")

// ErrRestartUnavailable rejects reset and switch on an engine that cannot
// restart a container at all — the ssh engine a hosted session runs,
// where a Pod offers no per-container restart and restartPolicy: Never
// makes killing PID 1 terminal.
//
// It is checked BEFORE either job begins, and that ordering is the whole
// point of it. Both jobs wipe the instances, and switch also rewrites the
// active bank, several phases before they reach the restart that cannot
// work: a hosted switch got as far as "the bank file says mcq, while
// docs-proxy and the facilitator are still serving the practical exam"
// and then stopped, leaving a session that was neither exam. An operation
// that cannot finish must not be allowed to start. Mapped to 501.
var ErrRestartUnavailable = errors.New("control: this deployment cannot restart containers — start a new session instead")

// Engine is the slice of the Docker Engine API the controller needs.
// containerIDs returned by FindContainer are opaque to this package.
type Engine interface {
	FindContainer(ctx context.Context, project, service string) (string, error)
	Exec(ctx context.Context, containerID string, cmd []string, onLine func(string)) (exitCode int, output string, err error)
	Restart(ctx context.Context, containerID string, timeoutSec int) error
}

// restartCapable lets an Engine declare up front that Restart will always
// fail, so a job needing one can be refused before its earlier phases
// destroy anything. Deliberately optional rather than a fourth Engine
// method: an engine that says nothing is assumed capable, which is true
// of the Docker engine and of every test fake.
type restartCapable interface {
	CanRestart() bool
}

// canRestart reports whether the engine can restart containers at all.
func (c *Controller) canRestart() bool {
	rc, ok := c.Engine.(restartCapable)
	return !ok || rc.CanRestart()
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

	// Switch-specific wiring (nil/empty disables StartSwitch).
	Catalog      *catalog.Catalog
	BankFile     string   // /shared/bank — the runtime bank source of truth
	RestartExtra []string // services restarted after the instances on a switch, in order (facilitator last)

	// Registry is the compose service holding the exam image registry, or
	// "" to skip. Wiped alongside the instances: see registryWipeCmd.
	Registry string
}

// The commands both control operations run inside containers.
// bootstrapCmd is the long pole of either job: it tears the kind cluster
// down and rebuilds it, printing its own progress, which execChecked
// republishes as the running phase's detail.
var (
	// Candidate state on an instance is not only files. The image-building
	// questions leave containers and images in podman's store, which lives
	// on its own volume and therefore survives both the cluster rebuild and
	// the instance restart — so without this, a second attempt began with
	// the previous attempt's image already built and its checks already
	// passing. `|| true` throughout: an instance whose podman was never
	// used has nothing to remove, and that is not a failed reset.
	wipeCmd = []string{"sh", "-c",
		"find /opt/course -mindepth 1 -delete; " +
			"podman rm -af >/dev/null 2>&1 || true; " +
			"podman rmi -af >/dev/null 2>&1 || true"}

	// The registry is the other half of that state: an image pushed during
	// one attempt is still there for the next one to be credited with.
	// Deleting the repositories directory is the bluntest correct answer —
	// the registry's own delete API needs a manifest digest per tag, and
	// this runs on a store nobody is meant to keep.
	registryWipeCmd = []string{"sh", "-c",
		"rm -rf /var/lib/registry/docker/registry/v2/repositories/* 2>/dev/null || true"}

	bootstrapCmd = []string{"bash", "-c", "kind delete cluster --name sim || true; /opt/sim/bootstrap.sh"}
)

// wipeCandidateState clears everything an attempt can leave behind
// outside the cluster: the per-instance work directories, podman's image
// and container store on each instance, and the exam registry. Shared by
// reset and switch so neither can quietly forget one of them — the
// registry in particular is easy to miss, because it is the only piece of
// candidate-writable state that does not live on an instance.
func (c *Controller) wipeCandidateState(ctx context.Context, jobID string) error {
	for _, inst := range c.Instances {
		if err := c.execChecked(ctx, jobID, "wipe-instances", inst, wipeCmd); err != nil {
			return err
		}
	}
	if c.Registry == "" {
		return nil
	}
	return c.execChecked(ctx, jobID, "wipe-instances", c.Registry, registryWipeCmd)
}

// bankIsMCQ reports whether bank grades in the facilitator rather than
// against the cluster. Unknown banks, a missing catalog, or an empty id
// all answer false: when in doubt, run the full sequence — a needless
// rebuild wastes minutes, a skipped one corrupts an attempt.
func (c *Controller) bankIsMCQ(bank string) bool {
	if c.Catalog == nil || bank == "" {
		return false
	}
	entry, ok := c.Catalog.Get(bank)
	return ok && entry.ExamType == "mcq"
}

// activeBank reads the runtime bank pointer, or "" when unset/unreadable.
func (c *Controller) activeBank() string {
	if c.BankFile == "" {
		return ""
	}
	raw, err := os.ReadFile(c.BankFile)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(raw))
}

// resetPhases is the checklist a reset job walks through, in order.
//
// An mcq bank has no state outside the session — no cluster to restore,
// no instance work to wipe — so its reset is just the session deletion
// plus a health check. Without this branch, "New attempt" after a
// multiple-choice exam cost the same 2-4 minute rebuild as a hands-on
// one, for a cluster the exam never touches.
func resetPhases(mcq bool) []job.PhaseSpec {
	if mcq {
		return []job.PhaseSpec{
			{ID: "end-session", Label: "End session and clear answers"},
			{ID: "verify", Label: "Verify environment"},
		}
	}
	return []job.PhaseSpec{
		{ID: "end-session", Label: "End session and lock desktop"},
		{ID: "wipe-instances", Label: "Wipe instance work directories"},
		{ID: "recreate-cluster", Label: "Recreate Kubernetes cluster"},
		{ID: "restart-instances", Label: "Restart exam instances"},
		{ID: "verify", Label: "Verify environment"},
	}
}

// StartReset begins an asynchronous reset job, returning the job record,
// job.ErrBusy if another operation is in flight, or ErrRestartUnavailable
// if the engine could not complete the job's restart phase.
func (c *Controller) StartReset() (job.Job, error) {
	mcq := c.bankIsMCQ(c.activeBank())
	// A hands-on reset restarts the instances after rebuilding the cluster
	// (resetPhases); an MCQ reset has neither phase, so it stays available
	// on an engine that cannot restart anything.
	if !mcq && !c.canRestart() {
		return job.Job{}, ErrRestartUnavailable
	}
	j, err := c.Store.Begin("reset", "", resetPhases(mcq))
	if err != nil {
		return job.Job{}, err
	}
	go c.runReset(j.ID, mcq)
	return j, nil
}

// runReset walks the reset sequence, failing the job at the first phase
// that errors. Context: each docker call gets a generous fixed timeout;
// the overall job is bounded by the sum of its phases.
func (c *Controller) runReset(jobID string, mcq bool) {
	ctx := context.Background()

	c.Store.StartPhase(jobID, "end-session")
	if err := c.endSession(ctx); err != nil {
		c.Store.Fail(jobID, err.Error())
		return
	}

	if !mcq {
		c.Store.StartPhase(jobID, "wipe-instances")
		if err := c.wipeCandidateState(ctx, jobID); err != nil {
			c.Store.Fail(jobID, err.Error())
			return
		}

		c.Store.StartPhase(jobID, "recreate-cluster")
		if err := c.execChecked(ctx, jobID, "recreate-cluster", "k8s-env", bootstrapCmd); err != nil {
			c.Store.Fail(jobID, err.Error())
			return
		}

		c.Store.StartPhase(jobID, "restart-instances")
		for _, inst := range c.Instances {
			if err := c.restart(ctx, inst); err != nil {
				c.Store.Fail(jobID, err.Error())
				return
			}
		}
	}

	c.Store.StartPhase(jobID, "verify")
	if err := c.verifyHealthy(ctx); err != nil {
		c.Store.Fail(jobID, err.Error())
		return
	}

	c.Store.Complete(jobID)
}

// switchPhases is the checklist a switch job walks through, in order.
//
// A switch TO an mcq bank keeps the wipe (leaving the outgoing bank's
// candidate work behind is what every switch promises to clean up) but
// skips the cluster rebuild and instance restarts: the incoming exam
// never touches either, and the rebuild is the whole 2-4 minute wait.
// The cluster keeps the outgoing bank's state until the next hands-on
// switch rebuilds it — nothing reads it in between.
//
// provision drops the two phases that only make sense when there is an
// outgoing exam. Nothing is switching: there is no session to end, no
// desktop to lock, and no candidate work to wipe, because no exam has
// ever been chosen in this environment. Running them anyway would work
// — both are no-ops against nothing — but the checklist is the only
// account of what is happening the candidate gets, and "End session and
// lock desktop" as the first thing they see after picking their first
// exam describes a product they have not used yet.
func switchPhases(mcq, provision bool) []job.PhaseSpec {
	if provision {
		phases := []job.PhaseSpec{{ID: "write-bank", Label: "Select the exam"}}
		if !mcq {
			phases = append(phases,
				job.PhaseSpec{ID: "recreate-cluster", Label: "Build the Kubernetes cluster"},
				job.PhaseSpec{ID: "restart-instances", Label: "Start the exam instances"},
			)
		}
		return append(phases,
			job.PhaseSpec{ID: "restart-facilitator", Label: "Start the exam services"},
			job.PhaseSpec{ID: "verify", Label: "Verify the exam is live"},
		)
	}
	if mcq {
		return []job.PhaseSpec{
			{ID: "end-session", Label: "End session and lock desktop"},
			{ID: "wipe-instances", Label: "Wipe instance work directories"},
			{ID: "write-bank", Label: "Activate the new exam bank"},
			{ID: "restart-facilitator", Label: "Restart exam services"},
			{ID: "verify", Label: "Verify the new exam is live"},
		}
	}
	return []job.PhaseSpec{
		{ID: "end-session", Label: "End session and lock desktop"},
		{ID: "wipe-instances", Label: "Wipe instance work directories"},
		{ID: "write-bank", Label: "Activate the new exam bank"},
		{ID: "recreate-cluster", Label: "Recreate Kubernetes cluster"},
		{ID: "restart-instances", Label: "Restart exam instances"},
		// Split out from the instance restart because this is the phase
		// that takes the facilitator — and therefore the browser's only
		// server — down for a few seconds. Naming it lets the UI say
		// "reconnecting" instead of appearing to freeze.
		{ID: "restart-facilitator", Label: "Restart exam services"},
		{ID: "verify", Label: "Verify the new exam is live"},
	}
}

// StartSwitch begins an asynchronous bank-switch job after validating
// the target (ErrInvalidBank) and confirming no attempt is running
// (ErrSessionRunning). job.ErrBusy propagates as-is.
func (c *Controller) StartSwitch(bank string) (job.Job, error) {
	if c.Catalog == nil || c.BankFile == "" {
		return job.Job{}, fmt.Errorf("control: switch not configured")
	}
	if err := c.Catalog.Switchable(bank); err != nil {
		return job.Job{}, fmt.Errorf("%w: %v", ErrInvalidBank, err)
	}
	mcq := c.bankIsMCQ(bank)
	// An environment that has never been told which exam to be is not
	// switching away from anything — it is being built for the first
	// time. The distinction is the bank file's absence and nothing else:
	// k8s-env rests without writing it, and the conductor is its only
	// other writer, so an empty read here means no exam was ever chosen.
	//
	// It changes the phase list and the job's op label; the sequence
	// below is otherwise the same one a switch has always run, which is
	// the point. Building an environment on demand was never a missing
	// capability — bootstrapCmd tears the cluster down and rebuilds it
	// from whatever /shared/bank says — only a missing name for it.
	provision := c.activeBank() == ""
	// Every switch restarts the bank-reading services (RestartExtra), and
	// a hands-on target restarts the instances too. Unlike reset there is
	// no variant that needs none, so on an engine that cannot restart, a
	// switch is refused outright rather than half-performed.
	//
	// Checked before the session-state probe below because this is a
	// static property of the deployment: an operation this engine can
	// never carry out should not first cost a round-trip to the
	// facilitator, nor report a transport failure in its place.
	if (!mcq || len(c.RestartExtra) > 0) && !c.canRestart() {
		return job.Job{}, ErrRestartUnavailable
	}

	state, err := c.sessionState(context.Background())
	if err != nil {
		return job.Job{}, fmt.Errorf("control: check session state: %w", err)
	}
	if state == "running" {
		return job.Job{}, ErrSessionRunning
	}

	op := "switch"
	if provision {
		op = "provision"
	}
	j, err := c.Store.Begin(op, bank, switchPhases(mcq, provision))
	if err != nil {
		return job.Job{}, err
	}
	go c.runSwitch(j.ID, bank, mcq, provision)
	return j, nil
}

// runSwitch is runReset plus the two switch-specific steps: the bank
// file is rewritten before the cluster re-bootstrap (which reads it),
// and the bank-reading services restart after the instances, the
// facilitator last (its entrypoint re-derives EXAM_JSON; its restart
// also triggers the session manager's cross-bank discard).
// When provision is set the first two steps are skipped rather than run
// against nothing — see switchPhases, whose checklist must agree with
// this sequence phase for phase. StartPhase silently ignores an id the
// job never declared, so a phase run without a spec would settle nothing
// and leave the UI counting a step that is not on screen.
func (c *Controller) runSwitch(jobID, bank string, mcq, provision bool) {
	ctx := context.Background()

	if !provision {
		c.Store.StartPhase(jobID, "end-session")
		if err := c.endSession(ctx); err != nil {
			c.Store.Fail(jobID, err.Error())
			return
		}

		c.Store.StartPhase(jobID, "wipe-instances")
		if err := c.wipeCandidateState(ctx, jobID); err != nil {
			c.Store.Fail(jobID, err.Error())
			return
		}
	}

	c.Store.StartPhase(jobID, "write-bank")
	if err := os.WriteFile(c.BankFile, []byte(bank), 0o644); err != nil {
		c.Store.Fail(jobID, fmt.Sprintf("write %s: %v", c.BankFile, err))
		return
	}

	if !mcq {
		c.Store.StartPhase(jobID, "recreate-cluster")
		if err := c.execChecked(ctx, jobID, "recreate-cluster", "k8s-env", bootstrapCmd); err != nil {
			c.Store.Fail(jobID, err.Error())
			return
		}

		c.Store.StartPhase(jobID, "restart-instances")
		for _, inst := range c.Instances {
			if err := c.restart(ctx, inst); err != nil {
				c.Store.Fail(jobID, err.Error())
				return
			}
		}
	}

	c.Store.StartPhase(jobID, "restart-facilitator")
	for _, svc := range c.RestartExtra {
		if err := c.restart(ctx, svc); err != nil {
			c.Store.Fail(jobID, err.Error())
			return
		}
	}

	c.Store.StartPhase(jobID, "verify")
	if err := c.verifyHealthy(ctx); err != nil {
		c.Store.Fail(jobID, err.Error())
		return
	}
	if err := c.verifyExamName(ctx, bank); err != nil {
		c.Store.Fail(jobID, err.Error())
		return
	}

	c.Store.Complete(jobID)
}

// Banks returns the /api/control/banks response body: the active bank
// (read from BankFile at call time — a switch may have just rewritten
// it) plus the full catalog.
func (c *Controller) Banks() any {
	active := ""
	if raw, err := os.ReadFile(c.BankFile); err == nil {
		active = strings.TrimSpace(string(raw))
	}
	var list []catalog.Entry
	if c.Catalog != nil {
		list = c.Catalog.List()
	}
	return map[string]any{"active": active, "banks": list}
}

// sessionState asks the facilitator which state the session is in.
func (c *Controller) sessionState(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.FacilitatorURL+"/api/session", nil)
	if err != nil {
		return "", err
	}
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var body struct {
		State string `json:"state"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", err
	}
	return body.State, nil
}

// verifyExamName confirms the restarted facilitator serves the target
// bank, polling within the same budget style as verifyHealthy.
func (c *Controller) verifyExamName(ctx context.Context, bank string) error {
	deadline := time.Now().Add(c.VerifyBudget)
	var last string
	for time.Now().Before(deadline) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.FacilitatorURL+"/api/exam", nil)
		if err != nil {
			return err
		}
		resp, err := c.HTTPClient.Do(req)
		if err == nil {
			var body struct {
				Name string `json:"name"`
			}
			decodeErr := json.NewDecoder(resp.Body).Decode(&body)
			resp.Body.Close()
			if decodeErr == nil {
				if body.Name == bank {
					return nil
				}
				last = body.Name
			}
		}
		time.Sleep(c.VerifyInterval)
	}
	return fmt.Errorf("verify: facilitator still serves exam %q, want %q", last, bank)
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
// Each output line is published as the running phase's detail, giving a
// long command a visible heartbeat instead of a frozen row.
func (c *Controller) execChecked(ctx context.Context, jobID, phaseID, service string, cmd []string) error {
	id, err := c.Engine.FindContainer(ctx, c.Project, service)
	if err != nil {
		return fmt.Errorf("%s: %w", service, err)
	}
	onLine := func(line string) {
		c.Store.SetPhaseDetail(jobID, phaseID, tail(line, maxDetailBytes))
		// The same line, kept instead of overwritten: the store's bounded
		// build log is what lets a candidate who looked away read the
		// minutes they missed instead of a single 160-byte tail.
		c.Store.AppendLog(jobID, line)
	}
	exit, out, err := c.Engine.Exec(ctx, id, cmd, onLine)
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

// maxDetailBytes caps the per-phase output line the UI polls. A stray
// very long line (a kubectl dump, a wall of base64) should not bloat
// every /api/control/status response for the rest of the phase.
const maxDetailBytes = 160

// tail returns at most the last n bytes of s — failed-phase output is
// surfaced to the UI, and the end of a build/bootstrap log is where the
// actual error lives.
func tail(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return "…" + s[len(s)-n:]
}
