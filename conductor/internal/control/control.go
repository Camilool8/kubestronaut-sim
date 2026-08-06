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

var ErrInvalidBank = errors.New("control: invalid bank")

var ErrSessionRunning = errors.New("control: a session is running — end the exam first")

var ErrRestartUnavailable = errors.New("control: this deployment cannot restart containers — start a new session instead")

type Engine interface {
	FindContainer(ctx context.Context, project, service string) (string, error)
	Exec(ctx context.Context, containerID string, cmd []string, onLine func(string)) (exitCode int, output string, err error)
	Restart(ctx context.Context, containerID string, timeoutSec int) error
}

type restartCapable interface {
	CanRestart() bool
}

func (c *Controller) canRestart() bool {
	rc, ok := c.Engine.(restartCapable)
	return !ok || rc.CanRestart()
}

type Controller struct {
	Engine         Engine
	Store          *job.Store
	Project        string
	FacilitatorURL string
	Instances      []string
	HTTPClient     *http.Client
	VerifyBudget   time.Duration
	VerifyInterval time.Duration

	Catalog      *catalog.Catalog
	BankFile     string
	RestartExtra []string

	Registry string
}

var (
	wipeCmd = []string{"sh", "-c",
		"find /opt/course -mindepth 1 -delete; " +
			"podman rm -af >/dev/null 2>&1 || true; " +
			"podman rmi -af >/dev/null 2>&1 || true"}
	registryWipeCmd = []string{"sh", "-c",
		"rm -rf /var/lib/registry/docker/registry/v2/repositories/* 2>/dev/null || true"}
	bootstrapCmd = []string{"bash", "-c", "kind delete cluster --name sim || true; /opt/sim/bootstrap.sh"}
)

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

func (c *Controller) bankIsMCQ(bank string) bool {
	if c.Catalog == nil || bank == "" {
		return false
	}
	entry, ok := c.Catalog.Get(bank)
	return ok && entry.ExamType == "mcq"
}

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

func (c *Controller) StartReset() (job.Job, error) {
	mcq := c.bankIsMCQ(c.activeBank())

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

		{ID: "restart-facilitator", Label: "Restart exam services"},
		{ID: "verify", Label: "Verify the new exam is live"},
	}
}

func (c *Controller) StartSwitch(bank string) (job.Job, error) {
	if c.Catalog == nil || c.BankFile == "" {
		return job.Job{}, fmt.Errorf("control: switch not configured")
	}
	if err := c.Catalog.Switchable(bank); err != nil {
		return job.Job{}, fmt.Errorf("%w: %v", ErrInvalidBank, err)
	}
	mcq := c.bankIsMCQ(bank)

	provision := c.activeBank() == ""

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

func (c *Controller) execChecked(ctx context.Context, jobID, phaseID, service string, cmd []string) error {
	id, err := c.Engine.FindContainer(ctx, c.Project, service)
	if err != nil {
		return fmt.Errorf("%s: %w", service, err)
	}
	onLine := func(line string) {
		c.Store.SetPhaseDetail(jobID, phaseID, tail(line, maxDetailBytes))

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

const maxDetailBytes = 160

func tail(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return "…" + s[len(s)-n:]
}
