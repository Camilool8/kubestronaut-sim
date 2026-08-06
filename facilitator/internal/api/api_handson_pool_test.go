package api_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"kubestronaut-sim/facilitator/internal/api"
	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/session"
)

const (
	handsOnPoolExamJSON = "testdata/exam-handson-pool.json"
	handsOnPoolBankDir  = "testdata/bank-handson-pool"
)

type fakeSeeder struct {
	mu sync.Mutex

	startErr  error
	asked     []string
	startCall int

	state     api.SeedState
	failMsg   string
	statusErr error
}

func newFakeSeeder() *fakeSeeder {
	return &fakeSeeder{state: api.SeedRunning}
}

func (f *fakeSeeder) Start(_ context.Context, questions []string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.startCall++
	if f.startErr != nil {
		return "", f.startErr
	}
	f.asked = append([]string(nil), questions...)
	return fmt.Sprintf("job-%d", f.startCall), nil
}

func (f *fakeSeeder) Status(_ context.Context, _ string) (api.SeedStatus, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.statusErr != nil {
		return api.SeedStatus{}, f.statusErr
	}
	return api.SeedStatus{State: f.state, Error: f.failMsg}, nil
}

func (f *fakeSeeder) set(state api.SeedState, msg string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.state, f.failMsg = state, msg
}

func (f *fakeSeeder) askedFor() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.asked...)
}

func (f *fakeSeeder) starts() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.startCall
}

func newHandsOnPoolTestServer(t *testing.T, seeder api.Seeder) (*testServer, *exam.Exam) {
	t.Helper()
	return newHandsOnPoolServer(t, seeder, fakeControl, t.TempDir()+"/session.json")
}

func newHandsOnPoolServer(t *testing.T, seeder api.Seeder, control http.Handler, sessionPath string) (*testServer, *exam.Exam) {
	t.Helper()

	ex, err := exam.Load(handsOnPoolExamJSON, handsOnPoolBankDir)
	if err != nil {
		t.Fatalf("exam.Load: %v", err)
	}

	clock, setNow := fakeClock(epoch)
	mgr, err := session.New(sessionPath, ex.Name, ex.Duration, clock, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}

	grader := &fakeGrader{}
	opts := []api.Option{}
	if seeder != nil {
		opts = append(opts, api.WithSeeder(seeder))
	}
	h := api.New(ex, handsOnPoolBankDir, mgr, grader.Grade, fakeDesktop, control, fstest.MapFS{}, nil, nil, opts...)
	ts := &testServer{handler: h, mgr: mgr, grader: grader, setNow: setNow}

	t.Cleanup(func() { ts.cancelAnyPreparation(t) })
	return ts, ex
}

func (ts *testServer) cancelAnyPreparation(t *testing.T) {
	t.Helper()
	rec := ts.do(t, http.MethodGet, "/api/session")
	var got sessionBody
	if rec.Code != http.StatusOK || json.Unmarshal(rec.Body.Bytes(), &got) != nil {
		return
	}
	if got.Preparing == nil {
		return
	}
	ts.do(t, http.MethodDelete, "/api/session")
}

type conductorStub struct {
	mu     sync.Mutex
	status string
	seen   []string
}

func (c *conductorStub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	c.mu.Lock()
	c.seen = append(c.seen, r.Method+" "+r.URL.Path)
	body := c.status
	c.mu.Unlock()

	if r.Method == http.MethodGet && r.URL.Path == "/api/control/status" {
		if body == "" {
			body = `{"busy": false}`
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(body))
		return
	}
	w.WriteHeader(http.StatusAccepted)
	w.Write([]byte(`{"job":{"id":"job-x"}}`))
}

func (c *conductorStub) asked(path string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, s := range c.seen {
		if strings.HasSuffix(s, " "+path) {
			return true
		}
	}
	return false
}

func (ts *testServer) waitFor(t *testing.T, what string, cond func(sessionBody) bool) sessionBody {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	var got sessionBody
	for time.Now().Before(deadline) {
		got = ts.session(t)
		if cond(got) {
			return got
		}
		time.Sleep(2 * time.Millisecond)
	}
	t.Fatalf("%s never happened within 5s; last session was %+v", what, got)
	return got
}

type prepareBody struct {
	State         string   `json:"state"`
	Bank          string   `json:"bank"`
	Mode          string   `json:"mode"`
	JobID         string   `json:"jobId"`
	QuestionCount int      `json:"questionCount"`
	Seed          string   `json:"seed"`
	PoolDigest    string   `json:"poolDigest"`
	DomainFilter  []string `json:"domainFilter"`
	PoolChanged   bool     `json:"poolChanged"`
}

func (ts *testServer) session(t *testing.T) sessionBody {
	t.Helper()
	rec := ts.do(t, http.MethodGet, "/api/session")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/session: status = %d, body=%s", rec.Code, rec.Body.String())
	}
	return decodeJSON[sessionBody](t, rec)
}

func (ts *testServer) waitSettled(t *testing.T) sessionBody {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		got := ts.session(t)
		if got.Preparing == nil {
			return got
		}
		time.Sleep(2 * time.Millisecond)
	}
	t.Fatal("preparation never settled within 5s")
	return sessionBody{}
}

func TestHandsOnPoolStartPreparesInsteadOfStarting(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam"}`)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202, body=%s", rec.Code, rec.Body.String())
	}
	got := decodeJSON[prepareBody](t, rec)

	if got.State != "preparing" {
		t.Errorf("State = %q, want %q", got.State, "preparing")
	}
	if got.JobID == "" {
		t.Error("JobID is empty; the client has nothing to watch")
	}
	if got.QuestionCount != 3 {
		t.Errorf("QuestionCount = %d, want the 3-question draw", got.QuestionCount)
	}
	if got.Seed == "" || got.PoolDigest == "" {
		t.Errorf("Seed/PoolDigest = %q/%q, want both — the draw is already made", got.Seed, got.PoolDigest)
	}

	asked := seeder.askedFor()
	if len(asked) != 3 {
		t.Fatalf("seeder asked for %v, want the 3 drawn ids", asked)
	}

	snap := ts.session(t)
	if snap.State != "idle" {
		t.Errorf("session state = %q, want idle while the cluster is being prepared", snap.State)
	}
	if snap.Preparing == nil {
		t.Fatal("GET /api/session reports no preparing object")
	}
	if snap.Preparing.JobID != got.JobID {
		t.Errorf("preparing.jobId = %q, want %q", snap.Preparing.JobID, got.JobID)
	}
	if snap.Preparing.QuestionCount != 3 {
		t.Errorf("preparing.questionCount = %d, want 3", snap.Preparing.QuestionCount)
	}
	if snap.Preparing.Mode != "exam" {
		t.Errorf("preparing.mode = %q, want exam", snap.Preparing.Mode)
	}
}

func TestHandsOnPoolAttemptStartsAfterSeedSucceeds(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam"}`)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202, body=%s", rec.Code, rec.Body.String())
	}
	prepared := decodeJSON[prepareBody](t, rec)

	seeder.set(api.SeedDone, "")
	got := ts.waitSettled(t)

	if got.State != "running" {
		t.Fatalf("state = %q after a successful seed, want running (prepareError=%q)", got.State, got.PrepareError)
	}
	if got.Seed != prepared.Seed {
		t.Errorf("attempt seed = %q, want the seed the seeding was done for (%q)", got.Seed, prepared.Seed)
	}
	if got.Mode != "exam" {
		t.Errorf("mode = %q, want exam", got.Mode)
	}

	ids := ts.mgr.QuestionIDs()
	asked := seeder.askedFor()
	if len(ids) != len(asked) {
		t.Fatalf("attempt has %v, cluster was prepared for %v", ids, asked)
	}
	for i := range ids {
		if ids[i] != asked[i] {
			t.Fatalf("attempt has %v, cluster was prepared for %v", ids, asked)
		}
	}
}

func TestHandsOnPoolFailedSeedLeavesSessionIdle(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam"}`); rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202, body=%s", rec.Code, rec.Body.String())
	}

	seeder.set(api.SeedFailed, "seeding q03 failed (exit 1): boom")
	got := ts.waitSettled(t)

	if got.State != "idle" {
		t.Errorf("state = %q after a failed seed, want idle", got.State)
	}
	if got.PrepareError == "" {
		t.Fatal("prepareError is empty; a failure the candidate cannot see is a hang")
	}
	if got.PrepareError != "seeding q03 failed (exit 1): boom" {
		t.Errorf("prepareError = %q, want the conductor's own message", got.PrepareError)
	}
	if len(ts.mgr.QuestionIDs()) != 0 {
		t.Errorf("a failed preparation left a drawn subset behind: %v", ts.mgr.QuestionIDs())
	}
}

func TestHandsOnPoolUnknownJobFails(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam"}`); rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202", rec.Code)
	}

	seeder.set(api.SeedUnknown, "")
	got := ts.waitSettled(t)

	if got.State != "idle" || got.PrepareError == "" {
		t.Errorf("state = %q, prepareError = %q; want idle with a stated reason", got.State, got.PrepareError)
	}
}

func TestHandsOnPoolSecondStartWhilePreparingConflicts(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam"}`); rec.Code != http.StatusAccepted {
		t.Fatalf("first start: status = %d, want 202", rec.Code)
	}
	rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("second start: status = %d, want 409, body=%s", rec.Code, rec.Body.String())
	}
	if n := seeder.starts(); n != 1 {
		t.Errorf("seeder started %d times, want 1", n)
	}
}

func TestHandsOnPoolDeleteCancelsPreparation(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam"}`); rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202", rec.Code)
	}
	if rec := ts.do(t, http.MethodDelete, "/api/session"); rec.Code != http.StatusNoContent {
		t.Fatalf("DELETE: status = %d, want 204", rec.Code)
	}

	if got := ts.session(t); got.Preparing != nil {
		t.Errorf("preparing survived the reset: %+v", got.Preparing)
	}

	seeder.set(api.SeedDone, "")
	time.Sleep(50 * time.Millisecond)

	if got := ts.session(t); got.State != "idle" {
		t.Errorf("state = %q, want idle: a cancelled preparation must not start an attempt", got.State)
	}
}

func TestHandsOnPoolWithoutSeederRefuses(t *testing.T) {
	ts, _ := newHandsOnPoolTestServer(t, nil)

	rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam"}`)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503, body=%s", rec.Code, rec.Body.String())
	}
	if got := ts.session(t); got.State != "idle" {
		t.Errorf("state = %q, want idle", got.State)
	}
}

func TestHandsOnPoolSeederRefusalIsImmediate(t *testing.T) {
	seeder := newFakeSeeder()
	seeder.startErr = errors.New("another control operation is in flight")
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409, body=%s", rec.Code, rec.Body.String())
	}
	if got := ts.session(t); got.Preparing != nil {
		t.Errorf("a refused seed left a preparation behind: %+v", got.Preparing)
	}
}

func TestHandsOnPoolRejectsBadSeedBeforeSeeding(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam","seed":"ZZZ"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400, body=%s", rec.Code, rec.Body.String())
	}
	if n := seeder.starts(); n != 0 {
		t.Errorf("seeder was asked to prepare %d times for a request that never drew", n)
	}
}

func TestHandsOnPoolScopesTheAttemptToTheSeededQuestions(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam"}`); rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202", rec.Code)
	}
	seeder.set(api.SeedDone, "")
	if got := ts.waitSettled(t); got.State != "running" {
		t.Fatalf("state = %q, want running", got.State)
	}

	rec := ts.do(t, http.MethodGet, "/api/exam")
	got := decodeJSON[examResponse](t, rec)
	if got.QuestionCount != 3 || len(got.Questions) != 3 {
		t.Fatalf("questionCount/len = %d/%d, want 3/3", got.QuestionCount, len(got.Questions))
	}

	drawn := map[string]bool{}
	for _, q := range got.Questions {
		drawn[q.ID] = true
	}
	for _, id := range []string{"q01", "q02", "q03", "q04", "q05", "q06"} {
		rec := ts.do(t, http.MethodGet, "/api/questions/"+id)
		want := http.StatusNotFound
		if drawn[id] {
			want = http.StatusOK
		}
		if rec.Code != want {
			t.Errorf("GET /api/questions/%s = %d, want %d (drawn=%v)", id, rec.Code, want, drawn[id])
		}
	}
}

const wantClusterHeld = "the exam environment is still set up for an earlier attempt's questions; reset the environment before starting a different attempt"

func startBody(seed string, domains ...string) string {
	body := `{"mode":"exam"`
	if seed != "" {
		body += `,"seed":"` + seed + `"`
	}
	if len(domains) > 0 {
		body += `,"domains":["` + strings.Join(domains, `","`) + `"]`
	}
	return body + `}`
}

func TestHandsOnPoolSecondDrawIsRefusedUntilTheClusterIsRebuilt(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", startBody("")); rec.Code != http.StatusAccepted {
		t.Fatalf("first start: status = %d, want 202", rec.Code)
	}
	seeder.set(api.SeedDone, "")
	if got := ts.waitSettled(t); got.State != "running" {
		t.Fatalf("state = %q, want running", got.State)
	}
	if rec := ts.do(t, http.MethodDelete, "/api/session"); rec.Code != http.StatusNoContent {
		t.Fatalf("DELETE: status = %d, want 204", rec.Code)
	}

	rec := ts.doJSON(t, http.MethodPost, "/api/session/start", startBody("", "Domain A"))
	if rec.Code != http.StatusConflict {
		t.Fatalf("second start: status = %d, want 409, body=%s", rec.Code, rec.Body.String())
	}
	if got := decodeJSON[errorBody](t, rec); got.Error != wantClusterHeld {
		t.Errorf("error = %q, want %q", got.Error, wantClusterHeld)
	}
	if n := seeder.starts(); n != 1 {
		t.Errorf("seeder started %d times; the refused draw must not have been seeded", n)
	}
	if got := ts.session(t); got.State != "idle" || got.Preparing != nil {
		t.Errorf("state = %q, preparing = %+v; a refused start must leave nothing behind", got.State, got.Preparing)
	}
}

func TestHandsOnPoolIdenticalDrawMayBeSeededAgain(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", startBody("abc123")); rec.Code != http.StatusAccepted {
		t.Fatalf("first start: status = %d, want 202", rec.Code)
	}
	seeder.set(api.SeedFailed, "seeding q03 failed (exit 1): boom")
	if got := ts.waitSettled(t); got.State != "idle" || got.PrepareError == "" {
		t.Fatalf("state = %q, prepareError = %q; want a failed preparation", got.State, got.PrepareError)
	}

	if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", startBody("abc123")); rec.Code != http.StatusAccepted {
		t.Fatalf("retry with the same seed: status = %d, want 202, body=%s", rec.Code, rec.Body.String())
	}
	if n := seeder.starts(); n != 2 {
		t.Errorf("seeder started %d times, want 2 — the retry must reach it", n)
	}
}

func TestHandsOnPoolResetLetsADifferentDrawThrough(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", startBody("")); rec.Code != http.StatusAccepted {
		t.Fatalf("first start: status = %d, want 202", rec.Code)
	}
	seeder.set(api.SeedDone, "")
	if got := ts.waitSettled(t); got.State != "running" {
		t.Fatalf("state = %q, want running", got.State)
	}
	if rec := ts.do(t, http.MethodDelete, "/api/session"); rec.Code != http.StatusNoContent {
		t.Fatalf("DELETE: status = %d, want 204", rec.Code)
	}
	if rec := ts.do(t, http.MethodPost, "/api/control/reset"); rec.Code != http.StatusAccepted {
		t.Fatalf("reset: status = %d, want the conductor's 202", rec.Code)
	}

	if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", startBody("", "Domain A")); rec.Code != http.StatusAccepted {
		t.Fatalf("start after reset: status = %d, want 202, body=%s", rec.Code, rec.Body.String())
	}
	if n := seeder.starts(); n != 2 {
		t.Errorf("seeder started %d times, want 2", n)
	}

	if got := ts.waitSettled(t); got.State != "running" {
		t.Fatalf("state after the second draw = %q, want running (prepareError=%q)", got.State, got.PrepareError)
	}
}

func TestHandsOnPoolRefusedResetDoesNotClearTheGuard(t *testing.T) {
	seeder := newFakeSeeder()
	busy := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeConflict(w)
	})
	ts, _ := newHandsOnPoolServer(t, seeder, busy, t.TempDir()+"/session.json")

	if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", startBody("")); rec.Code != http.StatusAccepted {
		t.Fatalf("first start: status = %d, want 202", rec.Code)
	}
	seeder.set(api.SeedDone, "")
	if got := ts.waitSettled(t); got.State != "running" {
		t.Fatalf("state = %q, want running", got.State)
	}
	ts.do(t, http.MethodDelete, "/api/session")
	if rec := ts.do(t, http.MethodPost, "/api/control/reset"); rec.Code != http.StatusConflict {
		t.Fatalf("reset: status = %d, want the conductor's 409", rec.Code)
	}

	rec := ts.doJSON(t, http.MethodPost, "/api/session/start", startBody("", "Domain A"))
	if rec.Code != http.StatusConflict {
		t.Fatalf("start after a refused reset: status = %d, want 409, body=%s", rec.Code, rec.Body.String())
	}
}

func writeConflict(w http.ResponseWriter) {
	w.WriteHeader(http.StatusConflict)
	w.Write([]byte(`{"error":"another control operation is in flight"}`))
}

func TestHandsOnPoolClusterRecordSurvivesARestart(t *testing.T) {
	sessionPath := t.TempDir() + "/session.json"
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolServer(t, seeder, fakeControl, sessionPath)

	if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", startBody("")); rec.Code != http.StatusAccepted {
		t.Fatalf("start: status = %d, want 202", rec.Code)
	}
	seeder.set(api.SeedDone, "")
	if got := ts.waitSettled(t); got.State != "running" {
		t.Fatalf("state = %q, want running", got.State)
	}

	restarted, _ := newHandsOnPoolServer(t, newFakeSeeder(), fakeControl, sessionPath)
	if got := restarted.session(t); got.State != "running" {
		t.Fatalf("resumed state = %q, want the persisted running attempt", got.State)
	}
	restarted.do(t, http.MethodDelete, "/api/session")

	rec := restarted.doJSON(t, http.MethodPost, "/api/session/start", startBody("", "Domain A"))
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409 — the resumed draw is still in the cluster, body=%s", rec.Code, rec.Body.String())
	}
}

func TestHandsOnPoolLostPreparationIsAnnounced(t *testing.T) {
	conductor := &conductorStub{status: `{"busy":true,"job":{"id":"job-7","op":"seed"}}`}
	ts, _ := newHandsOnPoolServer(t, newFakeSeeder(), conductor, t.TempDir()+"/session.json")

	got := ts.waitFor(t, "the lost preparation to be reported", func(s sessionBody) bool {
		return s.PrepareError != ""
	})
	if got.State != "idle" {
		t.Errorf("state = %q, want idle — there is no attempt to resume", got.State)
	}
	if !strings.Contains(got.PrepareError, "restarted") {
		t.Errorf("prepareError = %q, want it to say what happened", got.PrepareError)
	}

	rec := ts.doJSON(t, http.MethodPost, "/api/session/start", startBody(""))
	if rec.Code != http.StatusConflict {
		t.Fatalf("start after a lost preparation: status = %d, want 409, body=%s", rec.Code, rec.Body.String())
	}
	if got := decodeJSON[errorBody](t, rec); got.Error != wantClusterHeld {
		t.Errorf("error = %q, want %q", got.Error, wantClusterHeld)
	}
}

func TestHandsOnPoolSettledSeedJobCountsAsALostPreparation(t *testing.T) {
	conductor := &conductorStub{status: `{"busy":false,"lastJob":{"id":"job-7","op":"seed"}}`}
	ts, _ := newHandsOnPoolServer(t, newFakeSeeder(), conductor, t.TempDir()+"/session.json")

	ts.waitFor(t, "the orphaned seeding to be reported", func(s sessionBody) bool {
		return s.PrepareError != ""
	})
}

func TestHandsOnPoolNoAnnouncementAfterAReset(t *testing.T) {
	conductor := &conductorStub{status: `{"busy":false,"lastJob":{"id":"job-7","op":"reset"}}`}
	ts, _ := newHandsOnPoolServer(t, newFakeSeeder(), conductor, t.TempDir()+"/session.json")

	for i := 0; i < 50; i++ {
		if got := ts.session(t); got.PrepareError != "" {
			t.Fatalf("prepareError = %q after a reset, want nothing to report", got.PrepareError)
		}
		time.Sleep(time.Millisecond)
	}
	if !conductor.asked("/api/control/status") {
		t.Error("the conductor was never asked; the probe did not run at all")
	}
	if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", startBody("")); rec.Code != http.StatusAccepted {
		t.Fatalf("start: status = %d, want 202 — nothing is in the way", rec.Code)
	}
}

func TestHandsOnPoolProbeIgnoresThisProcessesOwnSeeding(t *testing.T) {
	conductor := &conductorStub{status: `{"busy":true,"job":{"id":"job-7","op":"seed"}}`}
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolServer(t, seeder, conductor, t.TempDir()+"/session.json")

	if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", startBody("")); rec.Code != http.StatusAccepted {
		t.Fatalf("start: status = %d, want 202", rec.Code)
	}
	for i := 0; i < 50; i++ {
		if got := ts.session(t); got.PrepareError != "" {
			t.Fatalf("prepareError = %q during our own preparation", got.PrepareError)
		}
		time.Sleep(time.Millisecond)
	}
	seeder.set(api.SeedDone, "")
	if got := ts.waitSettled(t); got.State != "running" {
		t.Fatalf("state = %q, want the attempt to have started normally", got.State)
	}
}

func TestUnpooledHandsOnStartIsUnchanged(t *testing.T) {
	ts := newTestServer(t)

	rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 — an unpooled bank starts at once, body=%s", rec.Code, rec.Body.String())
	}
	if got := ts.session(t); got.State != "running" || got.Preparing != nil {
		t.Errorf("state = %q, preparing = %+v; want a running attempt and no preparation", got.State, got.Preparing)
	}
}

func TestUnpooledHandsOnRepeatedAttemptsAreNotGated(t *testing.T) {
	ts := newTestServer(t)

	for i := 1; i <= 3; i++ {
		rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam"}`)
		if rec.Code != http.StatusOK {
			t.Fatalf("start %d: status = %d, want 200, body=%s", i, rec.Code, rec.Body.String())
		}
		if rec := ts.do(t, http.MethodDelete, "/api/session"); rec.Code != http.StatusNoContent {
			t.Fatalf("delete %d: status = %d, want 204", i, rec.Code)
		}
	}
}

func TestOnlyAPooledHandsOnBankProbesTheConductor(t *testing.T) {
	unpooled := &conductorStub{}
	ex, err := exam.Load(examJSON, bankDir)
	if err != nil {
		t.Fatalf("exam.Load: %v", err)
	}
	clock, _ := fakeClock(epoch)
	mgr, err := session.New(t.TempDir()+"/session.json", ex.Name, ex.Duration, clock, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}
	grader := &fakeGrader{}
	h := api.New(ex, bankDir, mgr, grader.Grade, fakeDesktop, unpooled, fstest.MapFS{}, nil, nil,
		api.WithSeeder(newFakeSeeder()))
	ts := &testServer{handler: h, mgr: mgr, grader: grader}

	for i := 0; i < 20; i++ {
		ts.session(t)
		time.Sleep(time.Millisecond)
	}
	if unpooled.asked("/api/control/status") {
		t.Error("an unpooled bank asked the conductor about seed jobs")
	}
}
