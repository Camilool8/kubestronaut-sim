package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"kubestronaut-sim/conductor/internal/job"
)

// fakeOps implements Ops without any real orchestration.
type fakeOps struct {
	store    *job.Store
	resetErr error
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
