package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"kubestronaut-sim/conductor/internal/control"
	"kubestronaut-sim/conductor/internal/job"
)

// Unlike reseed, seeding hands back a job to poll: it is minutes of work
// and the caller has to be able to watch it rather than hold a request
// open across it.
func TestSeedReturnsAJobToPoll(t *testing.T) {
	ops, h := newTestAPI(t)

	rec := post(t, h, "/api/control/seed", `{"questions":["q03","q01"]}`)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202, body=%s", rec.Code, rec.Body.String())
	}
	var body struct {
		Job job.Job `json:"job"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	if body.Job.ID == "" {
		t.Error("no job id in the response; there is nothing to poll")
	}
	if body.Job.Op != "seed" {
		t.Errorf("op = %q, want seed", body.Job.Op)
	}
	if len(ops.seeded) != 2 || ops.seeded[0] != "q03" || ops.seeded[1] != "q01" {
		t.Errorf("seeded = %v, want [q03 q01] in request order", ops.seeded)
	}
}

// The list reaches the controller exactly as sent, including empty and
// absent — those are the controller's to reject, because it is the one
// that knows the bank.
func TestSeedPassesTheListThrough(t *testing.T) {
	for _, c := range []struct {
		name string
		body string
		want int
	}{
		{"not JSON", `nonsense`, http.StatusBadRequest},
		{"no questions key", `{}`, http.StatusBadRequest},
		{"empty array", `{"questions":[]}`, http.StatusBadRequest},
	} {
		t.Run(c.name, func(t *testing.T) {
			ops, h := newTestAPI(t)
			ops.seedErr = control.ErrNoSeedTargets
			if rec := post(t, h, "/api/control/seed", c.body); rec.Code != c.want {
				t.Errorf("status = %d, want %d, body=%s", rec.Code, c.want, rec.Body.String())
			}
		})
	}
}

func TestSeedErrorsMapToStatuses(t *testing.T) {
	for _, c := range []struct {
		name string
		err  error
		want int
	}{
		{"busy", job.ErrBusy, http.StatusConflict},
		{"session running", control.ErrSessionRunning, http.StatusConflict},
		{"unknown question", control.ErrUnknownQuestion, http.StatusBadRequest},
		{"mcq bank", control.ErrNoSeed, http.StatusBadRequest},
		{"no targets", control.ErrNoSeedTargets, http.StatusBadRequest},
		{"anything else", errors.New("boom"), http.StatusInternalServerError},
	} {
		t.Run(c.name, func(t *testing.T) {
			ops, h := newTestAPI(t)
			ops.seedErr = c.err
			rec := post(t, h, "/api/control/seed", `{"questions":["q01"]}`)
			if rec.Code != c.want {
				t.Errorf("status = %d, want %d, body=%s", rec.Code, c.want, rec.Body.String())
			}
		})
	}
}
