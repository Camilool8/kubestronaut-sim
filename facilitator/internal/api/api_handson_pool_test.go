package api_test

import (
	"context"
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

// fakeSeeder is the api.Seeder test double. It records what it was asked
// to seed and answers Status with whatever the test has set, so the
// whole preparation state machine runs without a conductor, a Docker
// daemon or a cluster.
type fakeSeeder struct {
	mu sync.Mutex

	startErr  error
	asked     []string
	startCall int

	// state is what Status reports. Tests move it to drive the watcher.
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

// newHandsOnPoolTestServer builds a server over the pooled hands-on
// fixture: six questions, four in Domain A and two in Domain B weighted
// 60/40, spec.examLength 3. Pass a nil seeder to get a build with no
// route to the conductor.
func newHandsOnPoolTestServer(t *testing.T, seeder api.Seeder) (*testServer, *exam.Exam) {
	t.Helper()
	return newHandsOnPoolServer(t, seeder, fakeControl, t.TempDir()+"/session.json")
}

// newHandsOnPoolServer is the same server with the two things a restart
// or a conductor-state test has to control: which conductor it talks to,
// and which session file it resumes from. Building a second one over the
// same path is how a facilitator restart is written down here — the
// process's memory goes, the session file stays.
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
	return &testServer{handler: h, mgr: mgr, grader: grader, setNow: setNow}, ex
}

// conductorStub answers GET /api/control/status with a fixed job
// snapshot and 202s everything else, as the real conductor does for the
// operations that start a job. It records the paths it was asked for, so
// a test can also assert that a bank which must never ask, never asks.
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

// waitFor polls GET /api/session until cond holds, and fails with the
// last body it saw if it never does. The probes under test settle on
// their own goroutine, so there is nothing to synchronise on but the
// response a client would be reading anyway.
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

// prepareBody is POST /api/session/start's 202 shape.
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

// waitSettled polls GET /api/session until no preparation is in flight —
// the exact terminal condition the client contract names — and returns
// the settled body.
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

// The whole shape of the new path: a pooled hands-on start does not
// start a clock. It draws, hands the drawn ids to the seeder, and
// answers 202 with a job to watch — with the session still idle.
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

	// The cluster is asked for exactly the questions that were drawn.
	asked := seeder.askedFor()
	if len(asked) != 3 {
		t.Fatalf("seeder asked for %v, want the 3 drawn ids", asked)
	}

	// And nothing has started: the session is idle, with the preparation
	// reported beside it rather than as a fourth state.
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

// The clock starts when — and only when — the seeding has succeeded, and
// the attempt it starts is the draw that was seeded, not a fresh one.
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

	// The attempt contains exactly the seeded questions, in draw order.
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

// A failed seed leaves the session NOT started and says why. Dropping a
// candidate into a timed exam against a half-prepared cluster is the
// outcome this whole path exists to prevent.
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

// A conductor that has forgotten the job is neither success nor "still
// going": it must fail, or a candidate waits on a progress screen
// forever for a job nobody is running.
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

// One attempt at a time, on this path as on every other. The second
// start must not queue a second seed job over the first one's cluster.
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

// DELETE /api/session during a preparation abandons it. Without this the
// watcher would come back minutes later and start the very attempt the
// reset cancelled — against a cluster the reset has since rebuilt.
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

	// The seed job settles anyway — nothing can stop it — and must not
	// start anything.
	seeder.set(api.SeedDone, "")
	time.Sleep(50 * time.Millisecond)

	if got := ts.session(t); got.State != "idle" {
		t.Errorf("state = %q, want idle: a cancelled preparation must not start an attempt", got.State)
	}
}

// A build with no route to the conductor cannot prepare this bank's
// cluster. 503 and an explanation beats starting a timed attempt against
// questions that do not exist.
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

// A seeder that refuses outright (a control job in flight, a session the
// conductor can see running) is a synchronous failure: nothing to watch,
// so the caller is told at once and no preparation is left behind.
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

// A malformed request is still rejected before any seeding is asked for
// — the draw has to succeed before there is anything to seed.
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

// Once the attempt is running, everything downstream is the ordinary
// pooled behaviour: /api/exam lists the drawn subset, and a pool
// question this attempt did not draw is a 404 rather than a question the
// candidate can open against a cluster that was never prepared for it.
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

// wantClusterHeld is the exact refusal a start gets when the cluster is
// still prepared for something else. Written out here rather than
// exported from the package under test: this string is the whole
// interface — a candidate reads it in a toast and a script reads it in a
// 409 body — and a test that imported it could not notice it changing.
const wantClusterHeld = "the exam environment is still set up for an earlier attempt's questions; reset the environment before starting a different attempt"

// startBody is the JSON POST /api/session/start takes.
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

// THE defect this wave closes. A pooled hands-on bank seeds when the
// attempt starts, and nothing ever tears that seeding down — so DELETE
// /api/session followed by a fresh start used to run draw B's setup
// scripts over every object draw A's had created. Grading is scoped to
// B, so the score stayed honest while the exam did not: a leftover
// Service, an existing namespace, a Deployment already carrying the name
// a task asks for.
func TestHandsOnPoolSecondDrawIsRefusedUntilTheClusterIsRebuilt(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	// Draw A: the whole curriculum, so 2 from Domain A and 1 from Domain B.
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

	// Draw B: narrowed to Domain A, so 3 from Domain A and none from
	// Domain B — guaranteed to be a different set from draw A, whatever
	// either seed shuffled to.
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

// The other half of that rule, and the one that keeps the failure path
// usable: the SAME draw is allowed straight through. Re-running the same
// setup.sh scripts over their own output is the idempotent apply the
// conductor's seed job already is, so "the seeding failed, start again
// with the same seed" stays a retry rather than a second refusal.
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

// The way out, and the reason the refusal names it: a reset rebuilds the
// cluster, and the facilitator learns that by watching its own conductor
// proxy — the only route to the conductor this process has, and the one
// both the UI's "New attempt" and `./sim reset` take.
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
}

// A reset the conductor REFUSED changed nothing about the cluster, so it
// must not stand the guard down either. The proxy watches the status the
// conductor actually returned, not the request that was attempted.
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

// writeConflict is the conductor's answer when another control job holds
// the single-job lock.
func writeConflict(w http.ResponseWriter) {
	w.WriteHeader(http.StatusConflict)
	w.Write([]byte(`{"error":"another control operation is in flight"}`))
}

// The guard is in memory, but it is not lost with the process: an
// attempt's drawn questions ARE what its seeding created, and the draw is
// persisted with the session. So a facilitator that restarts mid-attempt
// comes back still knowing what the cluster holds.
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

	// The restart: a new process over the same session file.
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

// A facilitator that restarts DURING a preparation loses it: the draw
// lived in memory and there is nothing left to start. What it must not
// do is lose it in silence, which is a candidate watching a poller that
// will never change again. The conductor still knows a seed job was
// running, so the situation is stated on the field the client already
// renders.
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

	// And the cluster it seeded is a draw nothing here can name, so the
	// next start is refused for exactly the same reason a stale one is.
	rec := ts.doJSON(t, http.MethodPost, "/api/session/start", startBody(""))
	if rec.Code != http.StatusConflict {
		t.Fatalf("start after a lost preparation: status = %d, want 409, body=%s", rec.Code, rec.Body.String())
	}
	if got := decodeJSON[errorBody](t, rec); got.Error != wantClusterHeld {
		t.Errorf("error = %q, want %q", got.Error, wantClusterHeld)
	}
}

// A seed job that has already SETTLED counts the same way: the objects it
// made are just as present, and an idle session means no attempt was ever
// started from them.
func TestHandsOnPoolSettledSeedJobCountsAsALostPreparation(t *testing.T) {
	conductor := &conductorStub{status: `{"busy":false,"lastJob":{"id":"job-7","op":"seed"}}`}
	ts, _ := newHandsOnPoolServer(t, newFakeSeeder(), conductor, t.TempDir()+"/session.json")

	ts.waitFor(t, "the orphaned seeding to be reported", func(s sessionBody) bool {
		return s.PrepareError != ""
	})
}

// The false alarm that would make the whole thing untrustworthy: after a
// reset, the conductor's last job is the RESET, and there is nothing to
// report. This is the ordinary state of every environment between
// attempts.
func TestHandsOnPoolNoAnnouncementAfterAReset(t *testing.T) {
	conductor := &conductorStub{status: `{"busy":false,"lastJob":{"id":"job-7","op":"reset"}}`}
	ts, _ := newHandsOnPoolServer(t, newFakeSeeder(), conductor, t.TempDir()+"/session.json")

	// Ask enough times that the probe has certainly run and settled.
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

// This process's own preparation is not something to reconcile against.
// The probe stands down the moment a start has been made here, so a
// candidate who presses Start on a freshly booted facilitator can never
// be told their own in-flight attempt was lost.
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

// The regression guard on the promise that made this opt-in: an
// UNPOOLED hands-on bank never touches the seeder and never sees a 202.
// Every bank in the tree is in that category and must stay there.
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

// The guard added for pooled banks must be invisible on every bank in
// the tree. An unpooled hands-on bank seeds its whole self at boot, so
// attempt after attempt against the same cluster is not a defect — it is
// the only thing that has ever happened, and the sequence this refuses
// for a pooled bank must keep working here forever.
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

// And the conductor is never asked anything on their behalf either: the
// restart probe is a pooled-hands-on question, and a bank that seeds at
// boot (or has no cluster at all) has nothing for it to reconcile.
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
