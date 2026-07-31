package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"kubestronaut-sim/conductor/internal/job"
)

// ErrReseedBusy rejects a second concurrent re-seed. Mapped to 409.
var ErrReseedBusy = errors.New("control: a re-seed is already running")

// ErrUnknownQuestion rejects a question id that is not in the active
// bank. Mapped to 400.
var ErrUnknownQuestion = errors.New("control: unknown question")

// ErrNotTraining rejects a re-seed outside Training mode. Re-running a
// setup.sh destroys that question's work by design, which is a fine
// thing to offer while practising and a hostile one during an exam.
var ErrNotTraining = errors.New("control: re-seeding is available in Training mode only")

// ErrNoReseed rejects a re-seed against an mcq bank: there is no
// setup.sh and no cluster state to restore. Mapped to 400.
var ErrNoReseed = errors.New("control: nothing to reseed in a multiple-choice bank")

// questionIDPattern is the only shape a question id may take. It is the
// first of two gates — HasQuestion is the second — because this value
// arrives from the browser and ends up inside a shell command.
var questionIDPattern = regexp.MustCompile(`^q[0-9]{1,3}$`)

// reseedBudget bounds one setup.sh.
//
// 240s, not 120: q11's setup installs three Helm releases with
// `--wait --timeout 3m` and then deliberately installs a fourth that
// fails, waiting 45s for it. A budget sized off the median question
// would report a timeout on the slowest one working correctly.
const reseedBudget = 240 * time.Second

// reseedMu single-flights re-seeds. Deliberately its own lock rather
// than the job store's: job.Begin is a hard single-job mutex whose
// purpose is that cluster rebuilds never interleave, and the UI around
// it (ControlProgress, BackgroundJobChip) is built for 2-4 minute
// rebuilds. Re-seeding one question is a 5-45s idempotent apply — it
// must not lock out a reset, and it must not throw a full-screen
// progress overlay over a running attempt.
var reseedMu sync.Mutex

// Reseed re-runs one question's setup.sh, restoring that question's
// starting state and discarding whatever the candidate did to it.
//
// Synchronous: it returns when the work is done, so the caller gets a
// real outcome instead of a job id to poll. That is the whole reason it
// is not a job.
func (c *Controller) Reseed(ctx context.Context, qid string) error {
	// Shape first, before the value is used for anything at all.
	if !questionIDPattern.MatchString(qid) {
		return fmt.Errorf("%w: %q", ErrUnknownQuestion, qid)
	}

	bank := ""
	if raw, err := os.ReadFile(c.BankFile); err == nil {
		bank = strings.TrimSpace(string(raw))
	}
	if bank == "" {
		return fmt.Errorf("%w: no active bank", ErrUnknownQuestion)
	}
	// The allowlist. A pattern says the id is well-formed; only this says
	// it is real.
	if c.Catalog == nil || !c.Catalog.HasQuestion(bank, qid) {
		return fmt.Errorf("%w: %q is not in bank %q", ErrUnknownQuestion, qid, bank)
	}
	// Checked before anything shells out: an mcq bank has no setup.sh,
	// so the exec below would only ever produce a confusing bash error.
	if entry, ok := c.Catalog.Get(bank); ok && entry.ExamType == "mcq" {
		return ErrNoReseed
	}

	// Defers to jobs rather than competing with them: a reset is
	// rebuilding the very cluster this would seed into.
	if c.Store != nil && c.Store.Status().Busy {
		return job.ErrBusy
	}

	state, err := c.sessionMode(ctx)
	if err != nil {
		return fmt.Errorf("control: could not read session state: %w", err)
	}
	if state != "training" {
		return ErrNotTraining
	}

	if !reseedMu.TryLock() {
		return ErrReseedBusy
	}
	defer reseedMu.Unlock()

	ctx, cancel := context.WithTimeout(ctx, reseedBudget)
	defer cancel()

	id, err := c.Engine.FindContainer(ctx, c.Project, "k8s-env")
	if err != nil {
		return fmt.Errorf("k8s-env: %w", err)
	}
	cmd := []string{"bash", "-c", fmt.Sprintf("bash /banks/%s/%s/setup.sh", bank, qid)}
	exit, out, err := c.Engine.Exec(ctx, id, cmd, nil)
	if err != nil {
		return fmt.Errorf("k8s-env: exec: %w", err)
	}
	if exit != 0 {
		return fmt.Errorf("re-seeding %s failed (exit %d): %s", qid, exit, tail(out, 500))
	}
	return nil
}

// sessionMode asks the facilitator which mode the current attempt is in.
//
// Separate from sessionState rather than folded into it: that one is on
// the switch path and its callers only care about running-vs-not, and
// widening a function used by a destructive operation to serve a
// permission check is how permission checks end up reading the wrong
// field. The mode is server-side session state — there is no request
// parameter anywhere in this decision.
func (c *Controller) sessionMode(ctx context.Context) (string, error) {
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
		Mode  string `json:"mode"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", err
	}
	if body.State != "running" {
		return "", nil
	}
	return body.Mode, nil
}
