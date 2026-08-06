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

var ErrReseedBusy = errors.New("control: a re-seed is already running")

var ErrUnknownQuestion = errors.New("control: unknown question")

var ErrNotTraining = errors.New("control: re-seeding is available in Training mode only")

var ErrNoReseed = errors.New("control: nothing to reseed in a multiple-choice bank")

var questionIDPattern = regexp.MustCompile(`^q[0-9]{1,3}$`)

const reseedBudget = 240 * time.Second

var reseedMu sync.Mutex

func (c *Controller) Reseed(ctx context.Context, qid string) error {

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

	if c.Catalog == nil || !c.Catalog.HasQuestion(bank, qid) {
		return fmt.Errorf("%w: %q is not in bank %q", ErrUnknownQuestion, qid, bank)
	}

	if entry, ok := c.Catalog.Get(bank); ok && entry.ExamType == "mcq" {
		return ErrNoReseed
	}

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
