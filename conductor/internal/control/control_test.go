package control

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"kubestronaut-sim/conductor/internal/job"
)

// fakeEngine records every docker-side action and lets tests fail
// specific steps.
type fakeEngine struct {
	mu       sync.Mutex
	calls    []string
	execErr  map[string]error  // keyed by service name
	execExit map[string]int    // keyed by service name, default 0
	execOut  map[string]string // keyed by service name
}

func (f *fakeEngine) FindContainer(_ context.Context, project, service string) (string, error) {
	f.record("find:" + project + "/" + service)
	return "id-" + service, nil
}

func (f *fakeEngine) Exec(_ context.Context, containerID string, cmd []string) (int, string, error) {
	service := strings.TrimPrefix(containerID, "id-")
	f.record("exec:" + service + ":" + strings.Join(cmd, " "))
	if err := f.execErr[service]; err != nil {
		return 0, "", err
	}
	return f.execExit[service], f.execOut[service], nil
}

func (f *fakeEngine) Restart(_ context.Context, containerID string, _ int) error {
	f.record("restart:" + strings.TrimPrefix(containerID, "id-"))
	return nil
}

func (f *fakeEngine) record(s string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, s)
}

func (f *fakeEngine) recorded() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.calls...)
}

func newTestController(t *testing.T, eng Engine, facilitator string) *Controller {
	t.Helper()
	return &Controller{
		Engine:         eng,
		Store:          job.NewStore(func() time.Time { return time.Unix(0, 0) }),
		Project:        "kubestronaut-sim",
		FacilitatorURL: facilitator,
		Instances:      []string{"instance-1", "instance-2"},
		HTTPClient:     &http.Client{Timeout: 2 * time.Second},
		VerifyBudget:   500 * time.Millisecond,
		VerifyInterval: 10 * time.Millisecond,
	}
}

// waitIdle blocks until the store has no in-flight job.
func waitIdle(t *testing.T, s *job.Store) job.Snapshot {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		snap := s.Status()
		if !snap.Busy {
			return snap
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("job did not finish within 5s")
	return job.Snapshot{}
}

func TestResetRunsFullSequenceInOrder(t *testing.T) {
	var deletes, healthz int
	var mu sync.Mutex
	facilitator := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		switch {
		case r.Method == http.MethodDelete && r.URL.Path == "/api/session":
			deletes++
			w.WriteHeader(http.StatusNoContent)
		case r.URL.Path == "/healthz":
			healthz++
			fmt.Fprint(w, "ok")
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer facilitator.Close()

	eng := &fakeEngine{}
	c := newTestController(t, eng, facilitator.URL)

	j, err := c.StartReset()
	if err != nil {
		t.Fatalf("StartReset: %v", err)
	}
	snap := waitIdle(t, c.Store)

	if snap.LastJob == nil || snap.LastJob.ID != j.ID {
		t.Fatalf("LastJob = %+v, want finished job %s", snap.LastJob, j.ID)
	}
	if snap.LastJob.Error != "" {
		t.Fatalf("job failed: %s", snap.LastJob.Error)
	}
	mu.Lock()
	if deletes != 1 {
		t.Errorf("DELETE /api/session calls = %d, want 1", deletes)
	}
	if healthz == 0 {
		t.Error("verify never polled /healthz")
	}
	mu.Unlock()

	got := eng.recorded()
	want := []string{
		"find:kubestronaut-sim/instance-1",
		"exec:instance-1:find /opt/course -mindepth 1 -delete",
		"find:kubestronaut-sim/instance-2",
		"exec:instance-2:find /opt/course -mindepth 1 -delete",
		"find:kubestronaut-sim/k8s-env",
		"exec:k8s-env:bash -c kind delete cluster --name sim || true; /opt/sim/bootstrap.sh",
		"find:kubestronaut-sim/instance-1",
		"restart:instance-1",
		"find:kubestronaut-sim/instance-2",
		"restart:instance-2",
	}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Errorf("engine calls:\n%s\nwant:\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}
}

func TestResetFailsJobWhenExecExitsNonZero(t *testing.T) {
	facilitator := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer facilitator.Close()

	eng := &fakeEngine{
		execExit: map[string]int{"k8s-env": 1},
		execOut:  map[string]string{"k8s-env": "bootstrap: no exam.yaml"},
	}
	c := newTestController(t, eng, facilitator.URL)

	if _, err := c.StartReset(); err != nil {
		t.Fatalf("StartReset: %v", err)
	}
	snap := waitIdle(t, c.Store)

	if snap.LastJob == nil || snap.LastJob.Error == "" {
		t.Fatal("job should fail when an exec exits non-zero")
	}
	if !strings.Contains(snap.LastJob.Error, "no exam.yaml") {
		t.Errorf("error %q should surface the exec output", snap.LastJob.Error)
	}
	for _, call := range eng.recorded() {
		if strings.HasPrefix(call, "restart:") {
			t.Error("restart must not run after the cluster phase failed")
		}
	}
}

func TestResetFailsWhenVerifyTimesOut(t *testing.T) {
	facilitator := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.WriteHeader(http.StatusBadGateway) // healthz never healthy
	}))
	defer facilitator.Close()

	eng := &fakeEngine{}
	c := newTestController(t, eng, facilitator.URL)

	if _, err := c.StartReset(); err != nil {
		t.Fatalf("StartReset: %v", err)
	}
	snap := waitIdle(t, c.Store)

	if snap.LastJob == nil || !strings.Contains(snap.LastJob.Error, "verify") {
		t.Fatalf("job error = %+v, want verify failure", snap.LastJob)
	}
}

func TestStartResetRejectsConcurrentJobs(t *testing.T) {
	block := make(chan struct{})
	facilitator := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			<-block // hold the first job in its first phase
			w.WriteHeader(http.StatusNoContent)
			return
		}
		fmt.Fprint(w, "ok")
	}))
	defer facilitator.Close()

	c := newTestController(t, &fakeEngine{}, facilitator.URL)
	if _, err := c.StartReset(); err != nil {
		t.Fatalf("first StartReset: %v", err)
	}
	if _, err := c.StartReset(); err == nil {
		t.Fatal("second StartReset should be rejected while busy")
	}
	close(block)
	waitIdle(t, c.Store)
}
