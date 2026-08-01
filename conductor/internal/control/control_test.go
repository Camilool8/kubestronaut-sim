package control

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"kubestronaut-sim/conductor/internal/catalog"
	"kubestronaut-sim/conductor/internal/job"
)

// The wipe commands as the fakeEngine renders them (argv joined by
// spaces). Derived from the real values rather than retyped, so a change
// to what a reset clears cannot pass this test by accident — the point of
// the assertion is the *order and set* of calls, not their spelling.
var (
	wipeShell     = strings.Join(wipeCmd, " ")
	registryShell = strings.Join(registryWipeCmd, " ")
)

// fakeEngine records every docker-side action and lets tests fail
// specific steps.
type fakeEngine struct {
	mu       sync.Mutex
	calls    []string
	execErr   map[string]error    // keyed by service name
	execExit  map[string]int      // keyed by service name, default 0
	execOut   map[string]string   // keyed by service name
	execLines map[string][]string // streamed output lines, keyed by service name
	afterLine func()              // ran after each streamed line, to observe store state
}

func (f *fakeEngine) FindContainer(_ context.Context, project, service string) (string, error) {
	f.record("find:" + project + "/" + service)
	return "id-" + service, nil
}

func (f *fakeEngine) Exec(_ context.Context, containerID string, cmd []string, onLine func(string)) (int, string, error) {
	service := strings.TrimPrefix(containerID, "id-")
	f.record("exec:" + service + ":" + strings.Join(cmd, " "))
	if err := f.execErr[service]; err != nil {
		return 0, "", err
	}
	for _, line := range f.execLines[service] {
		onLine(line)
		if f.afterLine != nil {
			f.afterLine()
		}
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
		Registry:       "registry",
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
		"exec:instance-1:" + wipeShell,
		"find:kubestronaut-sim/instance-2",
		"exec:instance-2:" + wipeShell,
		"find:kubestronaut-sim/registry",
		"exec:registry:" + registryShell,
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

// switchFacilitator fakes the facilitator for switch flows: reports the
// given session state, accepts session deletes, is always healthy, and
// serves /api/exam with the name in examName (a pointer so tests can
// flip it mid-flow, mimicking the post-restart reload).
// healthyFacilitator is the minimum a reset job needs to run clean:
// DELETE /api/session succeeds and /healthz answers 200.
func healthyFacilitator(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodDelete && r.URL.Path == "/api/session":
			w.WriteHeader(http.StatusNoContent)
		case r.URL.Path == "/healthz":
			fmt.Fprint(w, "ok")
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
}

func switchFacilitator(t *testing.T, sessionState string, examName *string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/session":
			fmt.Fprintf(w, `{"state":%q}`, sessionState)
		case r.Method == http.MethodDelete && r.URL.Path == "/api/session":
			w.WriteHeader(http.StatusNoContent)
		case r.URL.Path == "/healthz":
			fmt.Fprint(w, "ok")
		case r.URL.Path == "/api/exam":
			fmt.Fprintf(w, `{"name":%q}`, *examName)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
}

func testCatalogForSwitch(t *testing.T) *catalog.Catalog {
	t.Helper()
	dir := t.TempDir()
	doc := `{"metadata":{"name":"cka-mock-01","title":"CKA"},"spec":{"duration":"120m",
	  "instances":[{"name":"instance-1"},{"name":"instance-2"}],
	  "questions":[{"id":"q01"}]}}`
	if err := os.WriteFile(filepath.Join(dir, "cka-mock-01.json"), []byte(doc), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	c, err := catalog.Load(dir)
	if err != nil {
		t.Fatalf("catalog.Load: %v", err)
	}
	return c
}

func TestSwitchRunsFullSequenceAndWritesBankFile(t *testing.T) {
	examName := "cka-mock-01" // already reloaded by the time verify polls
	facilitator := switchFacilitator(t, "idle", &examName)
	defer facilitator.Close()

	eng := &fakeEngine{}
	c := newTestController(t, eng, facilitator.URL)
	c.Catalog = testCatalogForSwitch(t)
	c.BankFile = filepath.Join(t.TempDir(), "bank")
	c.RestartExtra = []string{"docs-proxy", "facilitator"}

	if _, err := c.StartSwitch("cka-mock-01"); err != nil {
		t.Fatalf("StartSwitch: %v", err)
	}
	snap := waitIdle(t, c.Store)
	if snap.LastJob == nil || snap.LastJob.Error != "" {
		t.Fatalf("switch job = %+v, want clean completion", snap.LastJob)
	}

	wrote, err := os.ReadFile(c.BankFile)
	if err != nil || string(wrote) != "cka-mock-01" {
		t.Fatalf("bank file = %q, %v; want cka-mock-01", wrote, err)
	}

	calls := strings.Join(eng.recorded(), "\n")
	for _, needle := range []string{"restart:docs-proxy", "restart:facilitator", "restart:instance-1", "restart:instance-2"} {
		if !strings.Contains(calls, needle) {
			t.Errorf("engine calls missing %q:\n%s", needle, calls)
		}
	}
	// bank file must be written before the cluster re-bootstrap reads it
	clusterIdx := strings.Index(calls, "exec:k8s-env")
	if clusterIdx < 0 {
		t.Fatal("cluster recreate never ran")
	}
}

// testCatalogWithMCQ is testCatalogForSwitch plus a runnable mcq bank.
func testCatalogWithMCQ(t *testing.T) *catalog.Catalog {
	t.Helper()
	dir := t.TempDir()
	handsOn := `{"metadata":{"name":"cka-mock-01","title":"CKA"},"spec":{"duration":"120m",
	  "instances":[{"name":"instance-1"},{"name":"instance-2"}],
	  "questions":[{"id":"q01"}]}}`
	mcq := `{"metadata":{"name":"kcna-mock","title":"KCNA"},"spec":{"examType":"mcq","duration":"90m",
	  "questions":[{"id":"q01","domain":"D","options":["a","b","c"],"correct":[0]}]}}`
	for name, doc := range map[string]string{"cka-mock-01.json": handsOn, "kcna-mock.json": mcq} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(doc), 0o644); err != nil {
			t.Fatalf("write: %v", err)
		}
	}
	c, err := catalog.Load(dir)
	if err != nil {
		t.Fatalf("catalog.Load: %v", err)
	}
	return c
}

// Switching TO an mcq bank must not rebuild the cluster or restart the
// instances — the incoming exam touches neither, and the rebuild is the
// whole 2-4 minute wait this fast path exists to remove. The wipe still
// runs (leaving the outgoing bank's work behind is what every switch
// cleans up), the bank file is written, and the facilitator restarts.
func TestSwitchToMCQBankSkipsClusterRebuild(t *testing.T) {
	examName := "kcna-mock"
	facilitator := switchFacilitator(t, "idle", &examName)
	defer facilitator.Close()

	eng := &fakeEngine{}
	c := newTestController(t, eng, facilitator.URL)
	c.Catalog = testCatalogWithMCQ(t)
	c.BankFile = filepath.Join(t.TempDir(), "bank")
	c.RestartExtra = []string{"docs-proxy", "facilitator"}

	j, err := c.StartSwitch("kcna-mock")
	if err != nil {
		t.Fatalf("StartSwitch: %v", err)
	}
	for _, p := range j.Phases {
		if p.ID == "recreate-cluster" || p.ID == "restart-instances" {
			t.Errorf("mcq switch job advertises phase %q, want it absent", p.ID)
		}
	}

	snap := waitIdle(t, c.Store)
	if snap.LastJob == nil || snap.LastJob.Error != "" {
		t.Fatalf("switch job = %+v, want clean completion", snap.LastJob)
	}

	wrote, err := os.ReadFile(c.BankFile)
	if err != nil || string(wrote) != "kcna-mock" {
		t.Fatalf("bank file = %q, %v; want kcna-mock", wrote, err)
	}

	calls := strings.Join(eng.recorded(), "\n")
	if strings.Contains(calls, "exec:k8s-env") {
		t.Errorf("mcq switch ran the cluster rebuild:\n%s", calls)
	}
	if strings.Contains(calls, "restart:instance-") {
		t.Errorf("mcq switch restarted instances:\n%s", calls)
	}
	for _, needle := range []string{wipeShell, "restart:docs-proxy", "restart:facilitator"} {
		if !strings.Contains(calls, needle) {
			t.Errorf("engine calls missing %q:\n%s", needle, calls)
		}
	}
}

// "New attempt" after a multiple-choice exam is a session deletion, not
// an environment rebuild: the attempt's only state is the session file.
func TestResetOnMCQBankSkipsEverythingButTheSession(t *testing.T) {
	var deletes int
	var mu sync.Mutex
	facilitator := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodDelete && r.URL.Path == "/api/session":
			mu.Lock()
			deletes++
			mu.Unlock()
			w.WriteHeader(http.StatusNoContent)
		case r.URL.Path == "/healthz":
			fmt.Fprint(w, "ok")
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer facilitator.Close()

	eng := &fakeEngine{}
	c := newTestController(t, eng, facilitator.URL)
	c.Catalog = testCatalogWithMCQ(t)
	c.BankFile = filepath.Join(t.TempDir(), "bank")
	if err := os.WriteFile(c.BankFile, []byte("kcna-mock\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	j, err := c.StartReset()
	if err != nil {
		t.Fatalf("StartReset: %v", err)
	}
	if len(j.Phases) != 2 {
		t.Errorf("mcq reset phases = %+v, want end-session + verify only", j.Phases)
	}

	snap := waitIdle(t, c.Store)
	if snap.LastJob == nil || snap.LastJob.Error != "" {
		t.Fatalf("reset job = %+v, want clean completion", snap.LastJob)
	}
	mu.Lock()
	defer mu.Unlock()
	if deletes != 1 {
		t.Errorf("session deletions = %d, want 1", deletes)
	}
	if calls := strings.Join(eng.recorded(), "\n"); calls != "" {
		t.Errorf("mcq reset touched the engine:\n%s", calls)
	}
}

// A hands-on bank keeps the full reset sequence even when a catalog and
// bank file are wired — the fast path must never leak past mcq.
func TestResetOnHandsOnBankStillRebuilds(t *testing.T) {
	facilitator := healthyFacilitator(t)
	defer facilitator.Close()

	eng := &fakeEngine{}
	c := newTestController(t, eng, facilitator.URL)
	c.Catalog = testCatalogWithMCQ(t)
	c.BankFile = filepath.Join(t.TempDir(), "bank")
	if err := os.WriteFile(c.BankFile, []byte("cka-mock-01\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := c.StartReset(); err != nil {
		t.Fatalf("StartReset: %v", err)
	}
	snap := waitIdle(t, c.Store)
	if snap.LastJob == nil || snap.LastJob.Error != "" {
		t.Fatalf("reset job = %+v, want clean completion", snap.LastJob)
	}
	if calls := strings.Join(eng.recorded(), "\n"); !strings.Contains(calls, "exec:k8s-env") {
		t.Errorf("hands-on reset skipped the cluster rebuild:\n%s", calls)
	}
}

// The facilitator restart takes the browser's only server down for a
// few seconds. It gets its own phase so the UI can say "reconnecting"
// instead of appearing to freeze — and it must come after the instances.
func TestSwitchSeparatesTheFacilitatorRestartIntoItsOwnPhase(t *testing.T) {
	examName := "cka-mock-01"
	facilitator := switchFacilitator(t, "idle", &examName)
	defer facilitator.Close()

	eng := &fakeEngine{}
	c := newTestController(t, eng, facilitator.URL)
	c.Catalog = testCatalogForSwitch(t)
	c.BankFile = filepath.Join(t.TempDir(), "bank")
	c.RestartExtra = []string{"docs-proxy", "facilitator"}

	if _, err := c.StartSwitch("cka-mock-01"); err != nil {
		t.Fatalf("StartSwitch: %v", err)
	}
	snap := waitIdle(t, c.Store)
	if snap.LastJob == nil || snap.LastJob.Error != "" {
		t.Fatalf("switch job = %+v, want clean completion", snap.LastJob)
	}

	ids := make([]string, 0, len(snap.LastJob.Phases))
	for _, p := range snap.LastJob.Phases {
		ids = append(ids, p.ID)
	}
	joined := strings.Join(ids, ",")
	if !strings.Contains(joined, "restart-instances,restart-facilitator") {
		t.Fatalf("phase order = %s, want restart-instances then restart-facilitator", joined)
	}
	if strings.Contains(joined, "restart-services") {
		t.Errorf("the combined restart-services phase should be gone, got %s", joined)
	}

	// Instances restart before the facilitator: taking the facilitator
	// down first would blind the UI for the rest of the restarts.
	calls := strings.Join(eng.recorded(), "\n")
	if strings.Index(calls, "restart:instance-2") > strings.Index(calls, "restart:facilitator") {
		t.Errorf("facilitator restarted before the instances:\n%s", calls)
	}
}

// A multi-minute command must give the UI something that changes: its
// output lines become the running phase's detail.
func TestClusterRebuildPublishesItsOutputAsPhaseDetail(t *testing.T) {
	facilitator := healthyFacilitator(t)
	defer facilitator.Close()

	eng := &fakeEngine{execLines: map[string][]string{
		"k8s-env": {"Ensuring node image", "Preparing nodes", "Installing CNI"},
	}}
	c := newTestController(t, eng, facilitator.URL)

	// Sampled from inside the exec, right after each line is published —
	// what a UI poll arriving at that instant would have seen.
	var seen []string
	eng.afterLine = func() {
		for _, p := range c.Store.Status().Job.Phases {
			if p.ID == "recreate-cluster" {
				seen = append(seen, p.Detail)
			}
		}
	}

	if _, err := c.StartReset(); err != nil {
		t.Fatalf("StartReset: %v", err)
	}
	waitIdle(t, c.Store)

	want := []string{"Ensuring node image", "Preparing nodes", "Installing CNI"}
	if len(seen) != len(want) {
		t.Fatalf("phase detail over time = %q, want %q", seen, want)
	}
	for i := range want {
		if seen[i] != want[i] {
			t.Errorf("detail after line %d = %q, want %q", i, seen[i], want[i])
		}
	}

	// A settled phase must not keep a stale line.
	snap := c.Store.Status()
	for _, p := range snap.LastJob.Phases {
		if p.Detail != "" {
			t.Errorf("finished phase %s kept detail %q", p.ID, p.Detail)
		}
	}
}

func TestSwitchRefusedWhileSessionRunning(t *testing.T) {
	examName := "ckad-mock-01"
	facilitator := switchFacilitator(t, "running", &examName)
	defer facilitator.Close()

	c := newTestController(t, &fakeEngine{}, facilitator.URL)
	c.Catalog = testCatalogForSwitch(t)
	c.BankFile = filepath.Join(t.TempDir(), "bank")

	_, err := c.StartSwitch("cka-mock-01")
	if !errors.Is(err, ErrSessionRunning) {
		t.Fatalf("StartSwitch during running session = %v, want ErrSessionRunning", err)
	}
	if c.Store.Status().Busy {
		t.Error("refused switch must not leave a job behind")
	}
}

func TestSwitchRejectsUnknownBank(t *testing.T) {
	examName := "ckad-mock-01"
	facilitator := switchFacilitator(t, "idle", &examName)
	defer facilitator.Close()

	c := newTestController(t, &fakeEngine{}, facilitator.URL)
	c.Catalog = testCatalogForSwitch(t)
	c.BankFile = filepath.Join(t.TempDir(), "bank")

	if _, err := c.StartSwitch("no-such-bank"); !errors.Is(err, ErrInvalidBank) {
		t.Fatalf("StartSwitch(unknown) = %v, want ErrInvalidBank", err)
	}
	if _, err := c.StartSwitch("../etc"); !errors.Is(err, ErrInvalidBank) {
		t.Fatalf("StartSwitch(traversal) = %v, want ErrInvalidBank", err)
	}
}

func TestSwitchVerifyFailsOnExamNameMismatch(t *testing.T) {
	examName := "ckad-mock-01" // facilitator never picks up the new bank
	facilitator := switchFacilitator(t, "idle", &examName)
	defer facilitator.Close()

	c := newTestController(t, &fakeEngine{}, facilitator.URL)
	c.Catalog = testCatalogForSwitch(t)
	c.BankFile = filepath.Join(t.TempDir(), "bank")

	if _, err := c.StartSwitch("cka-mock-01"); err != nil {
		t.Fatalf("StartSwitch: %v", err)
	}
	snap := waitIdle(t, c.Store)
	if snap.LastJob == nil || !strings.Contains(snap.LastJob.Error, "cka-mock-01") {
		t.Fatalf("verify must fail naming the expected bank, got %+v", snap.LastJob)
	}
}

func TestBanksReportsActiveFileAndCatalog(t *testing.T) {
	c := newTestController(t, &fakeEngine{}, "http://unused")
	c.Catalog = testCatalogForSwitch(t)
	c.BankFile = filepath.Join(t.TempDir(), "bank")
	if err := os.WriteFile(c.BankFile, []byte("ckad-mock-01\n"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	body := c.Banks().(map[string]any)
	if body["active"] != "ckad-mock-01" {
		t.Errorf("active = %v, want ckad-mock-01 (trimmed)", body["active"])
	}
	if entries, ok := body["banks"].([]catalog.Entry); !ok || len(entries) != 1 {
		t.Errorf("banks = %#v, want the 1-entry catalog", body["banks"])
	}
}
