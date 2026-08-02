package api_test

import (
	"context"
	"errors"
	"fmt"
	"net/http"
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

	ex, err := exam.Load(handsOnPoolExamJSON, handsOnPoolBankDir)
	if err != nil {
		t.Fatalf("exam.Load: %v", err)
	}

	clock, setNow := fakeClock(epoch)
	mgr, err := session.New(t.TempDir()+"/session.json", ex.Name, ex.Duration, clock, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}

	grader := &fakeGrader{}
	opts := []api.Option{}
	if seeder != nil {
		opts = append(opts, api.WithSeeder(seeder))
	}
	h := api.New(ex, handsOnPoolBankDir, mgr, grader.Grade, fakeDesktop, fakeControl, fstest.MapFS{}, nil, nil, opts...)
	return &testServer{handler: h, mgr: mgr, grader: grader, setNow: setNow}, ex
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
