package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"kubestronaut-sim/conductor/internal/control"
	"kubestronaut-sim/conductor/internal/job"
)

// fakeOps implements Ops without any real orchestration.
type fakeOps struct {
	store     *job.Store
	resetErr  error
	switchErr error
	active    string
	banks     []string
}

func (f *fakeOps) StartReset() (job.Job, error) {
	if f.resetErr != nil {
		return job.Job{}, f.resetErr
	}
	return f.store.Begin("reset", "", []job.PhaseSpec{{ID: "verify", Label: "Verify"}})
}

func newTestAPI(t *testing.T) (*fakeOps, http.Handler) {
	t.Helper()
	store := job.NewStore(func() time.Time { return time.Unix(0, 0) })
	ops := &fakeOps{store: store}
	return ops, New(ops, store)
}

func TestHealthz(t *testing.T) {
	_, h := newTestAPI(t)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("healthz = %d, want 200", rec.Code)
	}
}

func TestResetAcceptedThenBusy(t *testing.T) {
	_, h := newTestAPI(t)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/control/reset", nil))
	if rec.Code != http.StatusAccepted {
		t.Fatalf("reset = %d, want 202, body=%s", rec.Code, rec.Body.String())
	}
	var accepted struct {
		Job job.Job `json:"job"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &accepted); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if accepted.Job.Op != "reset" || accepted.Job.ID == "" {
		t.Fatalf("job = %+v", accepted.Job)
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/control/reset", nil))
	if rec.Code != http.StatusConflict {
		t.Fatalf("busy reset = %d, want 409, body=%s", rec.Code, rec.Body.String())
	}
}

func TestResetRejectsGet(t *testing.T) {
	_, h := newTestAPI(t)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/control/reset", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET reset = %d, want 405", rec.Code)
	}
}

func TestStatusReportsStore(t *testing.T) {
	ops, h := newTestAPI(t)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/control/status", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var idle job.Snapshot
	if err := json.Unmarshal(rec.Body.Bytes(), &idle); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if idle.Busy {
		t.Fatal("fresh store should be idle")
	}

	j, _ := ops.StartReset()
	ops.store.StartPhase(j.ID, "verify")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/control/status", nil))
	var busy job.Snapshot
	if err := json.Unmarshal(rec.Body.Bytes(), &busy); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !busy.Busy || busy.Job == nil || busy.Job.Phase != "verify" {
		t.Fatalf("busy snapshot = %+v", busy)
	}
}

func (f *fakeOps) StartSwitch(bank string) (job.Job, error) {
	if f.switchErr != nil {
		return job.Job{}, f.switchErr
	}
	return f.store.Begin("switch", bank, []job.PhaseSpec{{ID: "verify", Label: "Verify"}})
}

func (f *fakeOps) Banks() any {
	return map[string]any{"active": f.active, "banks": f.banks}
}

func TestBanksEndpoint(t *testing.T) {
	ops, h := newTestAPI(t)
	ops.active = "ckad-mock-01"
	ops.banks = []string{"ckad-mock-01", "cka-mock-01"}

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/control/banks", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("banks = %d, want 200", rec.Code)
	}
	var body struct {
		Active string   `json:"active"`
		Banks  []string `json:"banks"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Active != "ckad-mock-01" || len(body.Banks) != 2 {
		t.Fatalf("body = %+v", body)
	}
}

func TestSwitchEndpointStatusMapping(t *testing.T) {
	cases := []struct {
		name    string
		body    string
		err     error
		want    int
	}{
		{"accepted", `{"bank":"cka-mock-01"}`, nil, http.StatusAccepted},
		{"invalid bank", `{"bank":"nope"}`, control.ErrInvalidBank, http.StatusBadRequest},
		{"session running", `{"bank":"cka-mock-01"}`, control.ErrSessionRunning, http.StatusConflict},
		{"busy", `{"bank":"cka-mock-01"}`, job.ErrBusy, http.StatusConflict},
		{"malformed body", `{`, nil, http.StatusBadRequest},
		{"missing bank", `{}`, nil, http.StatusBadRequest},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ops, h := newTestAPI(t)
			ops.switchErr = c.err
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/api/control/switch", strings.NewReader(c.body))
			h.ServeHTTP(rec, req)
			if rec.Code != c.want {
				t.Fatalf("switch(%s) = %d, want %d, body=%s", c.name, rec.Code, c.want, rec.Body.String())
			}
		})
	}
}
