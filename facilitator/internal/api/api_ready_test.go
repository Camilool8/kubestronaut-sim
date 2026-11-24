package api_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"kubestronaut-sim/facilitator/internal/api"
)

const awaitBody = `{"mode":"exam","awaitStart":true}`

type begunBody struct {
	State            string `json:"state"`
	Mode             string `json:"mode"`
	StartedAt        string `json:"startedAt"`
	DurationSeconds  int    `json:"durationSeconds"`
	RemainingSeconds int    `json:"remainingSeconds"`
	Seed             string `json:"seed"`
}

func prepareReady(t *testing.T, ts *testServer, seeder *fakeSeeder) sessionBody {
	t.Helper()
	rec := ts.doJSON(t, http.MethodPost, "/api/session/start", awaitBody)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("start: status = %d, want 202, body=%s", rec.Code, rec.Body.String())
	}
	if got := decodeJSON[prepareBody](t, rec); !got.AwaitStart {
		t.Fatal("the 202 did not echo awaitStart; the client cannot tell the gate was honoured")
	}
	seeder.set(api.SeedDone, "")
	return ts.waitFor(t, "the preparation to become ready", func(s sessionBody) bool {
		return s.Preparing != nil && s.Preparing.Ready
	})
}

func TestAwaitStartWaitsInReadyInsteadOfStarting(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	got := prepareReady(t, ts, seeder)

	if got.State != "idle" {
		t.Errorf("state = %q, want idle: a ready attempt has no clock", got.State)
	}
	if got.Preparing.ReadyAt == "" {
		t.Error("readyAt is empty on a ready preparation")
	}
	if !got.Preparing.AwaitStart {
		t.Error("preparing.awaitStart is false on a gated preparation")
	}
	if got.Preparing.DurationSeconds != 3600 {
		t.Errorf("preparing.durationSeconds = %d, want the exam's 3600", got.Preparing.DurationSeconds)
	}
	if got.Preparing.QuestionCount != 3 || got.Preparing.Mode != "exam" {
		t.Errorf("preparing = %+v, want mode exam and 3 questions", got.Preparing)
	}

	time.Sleep(50 * time.Millisecond)
	if again := ts.session(t); again.State != "idle" || again.Preparing == nil || !again.Preparing.Ready {
		t.Fatalf("a ready attempt moved on by itself: state=%q preparing=%+v", again.State, again.Preparing)
	}
	if ids := ts.mgr.QuestionIDs(); len(ids) != 0 {
		t.Errorf("the session holds a draw %v before the candidate started it", ids)
	}
}

func TestAbsentAwaitStartStillStartsByItself(t *testing.T) {
	for _, body := range []string{`{"mode":"exam"}`, `{"mode":"exam","awaitStart":false}`, ``} {
		seeder := newFakeSeeder()
		ts, _ := newHandsOnPoolTestServer(t, seeder)

		rec := ts.doJSON(t, http.MethodPost, "/api/session/start", body)
		if rec.Code != http.StatusAccepted {
			t.Fatalf("body %q: status = %d, want 202", body, rec.Code)
		}
		if decodeJSON[prepareBody](t, rec).AwaitStart {
			t.Errorf("body %q: the 202 claims a gate nobody asked for", body)
		}
		if got := ts.session(t); got.Preparing == nil || got.Preparing.AwaitStart {
			t.Errorf("body %q: preparing = %+v, want an ungated preparation", body, got.Preparing)
		}
		seeder.set(api.SeedDone, "")
		if got := ts.waitSettled(t); got.State != "running" {
			t.Fatalf("body %q: state = %q, want running: an absent flag keeps the old auto-start", body, got.State)
		}
	}
}

func TestBeginStartsTheClockAtTheClick(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	prepareReady(t, ts, seeder)
	asked := seeder.askedFor()

	click := epoch.Add(25 * time.Minute)
	ts.setNow(click)

	rec := ts.doJSON(t, http.MethodPost, "/api/session/begin", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("begin: status = %d, want 200, body=%s", rec.Code, rec.Body.String())
	}
	got := decodeJSON[begunBody](t, rec)
	if got.State != "running" {
		t.Fatalf("state = %q, want running", got.State)
	}
	started, err := time.Parse(time.RFC3339Nano, got.StartedAt)
	if err != nil {
		t.Fatalf("startedAt %q: %v", got.StartedAt, err)
	}
	if !started.Equal(click) {
		t.Errorf("startedAt = %v, want the click time %v, not the seed's finish", started, click)
	}
	if got.RemainingSeconds != 3600 {
		t.Errorf("remainingSeconds = %d, want the whole 3600: no time passes while ready", got.RemainingSeconds)
	}

	snap := ts.session(t)
	if snap.State != "running" || snap.Preparing != nil {
		t.Errorf("after begin: state=%q preparing=%+v, want running with no preparation", snap.State, snap.Preparing)
	}
	ids := ts.mgr.QuestionIDs()
	if strings.Join(ids, ",") != strings.Join(asked, ",") {
		t.Errorf("attempt has %v, the cluster was seeded for %v", ids, asked)
	}
}

func TestBeginBeforeReadyConflicts(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", awaitBody); rec.Code != http.StatusAccepted {
		t.Fatalf("start: status = %d, want 202", rec.Code)
	}
	rec := ts.doJSON(t, http.MethodPost, "/api/session/begin", "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("begin while seeding: status = %d, want 409, body=%s", rec.Code, rec.Body.String())
	}
	if msg := decodeJSON[errorBody](t, rec).Error; !strings.Contains(msg, "still being prepared") {
		t.Errorf("error = %q, want it to say the environment is still being prepared", msg)
	}
	if got := ts.session(t); got.State != "idle" || got.Preparing == nil || got.Preparing.Ready {
		t.Errorf("state=%q preparing=%+v, want the preparation untouched", got.State, got.Preparing)
	}
}

func TestBeginWithNothingPreparedConflicts(t *testing.T) {
	ts, _ := newHandsOnPoolTestServer(t, newFakeSeeder())

	rec := ts.doJSON(t, http.MethodPost, "/api/session/begin", "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409, body=%s", rec.Code, rec.Body.String())
	}
	if msg := decodeJSON[errorBody](t, rec).Error; !strings.Contains(msg, "no attempt is waiting") {
		t.Errorf("error = %q, want it to say nothing is waiting", msg)
	}
	if got := ts.session(t); got.State != "idle" {
		t.Errorf("state = %q, want idle", got.State)
	}
}

func TestBeginOnAnAutoStartPreparationWaitsForTheSeed(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam"}`); rec.Code != http.StatusAccepted {
		t.Fatalf("start: status = %d, want 202", rec.Code)
	}
	if rec := ts.doJSON(t, http.MethodPost, "/api/session/begin", ""); rec.Code != http.StatusConflict {
		t.Fatalf("begin: status = %d, want 409: an ungated preparation is not ready to begin", rec.Code)
	}
}

func TestDoubleBeginKeepsTheFirstClick(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	prepareReady(t, ts, seeder)
	first := epoch.Add(5 * time.Minute)
	ts.setNow(first)

	rec := ts.doJSON(t, http.MethodPost, "/api/session/begin", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("first begin: status = %d, want 200", rec.Code)
	}
	ts.setNow(first.Add(2 * time.Second))
	rec = ts.doJSON(t, http.MethodPost, "/api/session/begin", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("second begin: status = %d, want 200, body=%s", rec.Code, rec.Body.String())
	}
	got := decodeJSON[begunBody](t, rec)
	started, _ := time.Parse(time.RFC3339Nano, got.StartedAt)
	if got.State != "running" || !started.Equal(first) {
		t.Errorf("second begin: state=%q startedAt=%v, want the running attempt from the first click (%v)", got.State, started, first)
	}
}

func TestConcurrentBeginsStartOneAttempt(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	prepareReady(t, ts, seeder)

	const n = 8
	var wg sync.WaitGroup
	codes := make([]int, n)
	starts := make([]string, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			rec := ts.doJSON(t, http.MethodPost, "/api/session/begin", "")
			codes[i] = rec.Code
			if rec.Code == http.StatusOK {
				starts[i] = decodeJSON[begunBody](t, rec).StartedAt
			}
		}(i)
	}
	wg.Wait()

	for i := 0; i < n; i++ {
		if codes[i] != http.StatusOK {
			t.Errorf("begin %d: status = %d, want 200", i, codes[i])
		}
		if starts[i] != starts[0] {
			t.Errorf("begin %d: startedAt = %q, want one attempt (%q)", i, starts[i], starts[0])
		}
	}
}

func TestDeleteWhileReadyCancels(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	prepareReady(t, ts, seeder)
	if rec := ts.do(t, http.MethodDelete, "/api/session"); rec.Code != http.StatusNoContent {
		t.Fatalf("DELETE: status = %d, want 204", rec.Code)
	}
	if got := ts.session(t); got.State != "idle" || got.Preparing != nil {
		t.Fatalf("state=%q preparing=%+v, want a plain idle session", got.State, got.Preparing)
	}
	if rec := ts.doJSON(t, http.MethodPost, "/api/session/begin", ""); rec.Code != http.StatusConflict {
		t.Fatalf("begin after cancel: status = %d, want 409", rec.Code)
	}
	if got := ts.session(t); got.State != "idle" {
		t.Errorf("state = %q, want idle: a cancelled ready attempt must never start", got.State)
	}
}

func TestResetWhileReadyDropsTheReadyAttempt(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	prepareReady(t, ts, seeder)
	if rec := ts.do(t, http.MethodPost, "/api/control/reset"); rec.Code != http.StatusAccepted {
		t.Fatalf("reset: status = %d, want the conductor's 202", rec.Code)
	}
	if got := ts.session(t); got.Preparing != nil {
		t.Fatalf("preparing = %+v survived a cluster rebuild; starting it would run against an empty cluster", got.Preparing)
	}
	if rec := ts.doJSON(t, http.MethodPost, "/api/session/begin", ""); rec.Code != http.StatusConflict {
		t.Fatalf("begin after reset: status = %d, want 409", rec.Code)
	}
}

func TestRefusedResetKeepsTheReadyAttempt(t *testing.T) {
	seeder := newFakeSeeder()
	busy := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeConflict(w)
	})
	ts, _ := newHandsOnPoolServer(t, seeder, busy, t.TempDir()+"/session.json")

	prepareReady(t, ts, seeder)
	if rec := ts.do(t, http.MethodPost, "/api/control/reset"); rec.Code != http.StatusConflict {
		t.Fatalf("reset: status = %d, want the conductor's 409", rec.Code)
	}
	if got := ts.session(t); got.Preparing == nil || !got.Preparing.Ready {
		t.Fatalf("preparing = %+v, want the ready attempt kept: the cluster was not touched", got.Preparing)
	}
	if rec := ts.doJSON(t, http.MethodPost, "/api/session/begin", ""); rec.Code != http.StatusOK {
		t.Fatalf("begin: status = %d, want 200", rec.Code)
	}
}

func TestSecondStartWhileReadyConflicts(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	prepareReady(t, ts, seeder)
	if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", awaitBody); rec.Code != http.StatusConflict {
		t.Fatalf("second start: status = %d, want 409", rec.Code)
	}
	if n := seeder.starts(); n != 1 {
		t.Errorf("seeder started %d times, want 1", n)
	}
	if got := ts.session(t); got.Preparing == nil || !got.Preparing.Ready {
		t.Errorf("preparing = %+v, want the ready attempt untouched", got.Preparing)
	}
}

func TestRestartWhileReadyKeepsTheAttemptReadyWithoutAClock(t *testing.T) {
	sessionPath := t.TempDir() + "/session.json"
	conductor := &conductorStub{status: seedDoneStatus}
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolServer(t, seeder, conductor, sessionPath)

	before := prepareReady(t, ts, seeder)
	asked := seeder.askedFor()
	saved, ok := readPrepFile(t, sessionPath)
	if !ok || !saved.Ready || saved.JobID != "job-1" || !saved.AwaitStart {
		t.Fatalf("prep file = %+v (exists=%v), want a ready, gated record of job-1", saved, ok)
	}

	again := newFakeSeeder()
	restarted, _ := newHandsOnPoolServer(t, again, conductor, sessionPath)
	got := restarted.waitFor(t, "the ready attempt to come back", func(s sessionBody) bool {
		return s.Preparing != nil && s.Preparing.Ready
	})
	if got.State != "idle" || got.PrepareError != "" {
		t.Fatalf("state=%q prepareError=%q, want idle and no error", got.State, got.PrepareError)
	}
	if got.Preparing.ReadyAt != before.Preparing.ReadyAt || got.Preparing.StartedAt != before.Preparing.StartedAt {
		t.Errorf("preparing = %+v, want the saved timestamps of %+v", got.Preparing, before.Preparing)
	}
	if got.Preparing.Seed != before.Preparing.Seed || got.Preparing.QuestionCount != 3 || got.Preparing.DurationSeconds != 3600 {
		t.Errorf("preparing = %+v, want the saved draw of %+v", got.Preparing, before.Preparing)
	}

	time.Sleep(50 * time.Millisecond)
	if still := restarted.session(t); still.State != "idle" {
		t.Fatalf("state = %q, want idle: a restart must never start a clock", still.State)
	}
	if n := again.starts(); n != 0 {
		t.Errorf("the restarted service seeded %d time(s), want 0: the cluster already holds the draw", n)
	}

	rec := restarted.doJSON(t, http.MethodPost, "/api/session/begin", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("begin after restart: status = %d, want 200, body=%s", rec.Code, rec.Body.String())
	}
	if begun := decodeJSON[begunBody](t, rec); begun.State != "running" || begun.RemainingSeconds != 3600 {
		t.Errorf("begin = %+v, want a running attempt with the whole 3600s", begun)
	}
	if ids := restarted.mgr.QuestionIDs(); strings.Join(ids, ",") != strings.Join(asked, ",") {
		t.Errorf("attempt has %v, the cluster was seeded for %v", ids, asked)
	}
	if _, ok := readPrepFile(t, sessionPath); ok {
		t.Error("the prep file outlived begin; another restart would offer a started attempt again")
	}
}

func TestUnpooledBankIgnoresAwaitStart(t *testing.T) {
	ts := newTestServer(t)

	rec := ts.doJSON(t, http.MethodPost, "/api/session/start", awaitBody)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: an unpooled bank has nothing to prepare, body=%s", rec.Code, rec.Body.String())
	}
	if got := ts.session(t); got.State != "running" || got.Preparing != nil {
		t.Errorf("state=%q preparing=%+v, want running at once", got.State, got.Preparing)
	}
}

func TestBeginFromATouchOnlyDeviceIsRefused(t *testing.T) {
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolTestServer(t, seeder)

	prepareReady(t, ts, seeder)

	req := httptest.NewRequest(http.MethodPost, "/api/session/begin", nil)
	req.Header.Set("X-Sim-Pointer", "coarse")
	rec := httptest.NewRecorder()
	ts.handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409, body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"desktop_required"`) {
		t.Errorf("body = %s, want code desktop_required", rec.Body.String())
	}
	if got := ts.session(t); got.State != "idle" || got.Preparing == nil || !got.Preparing.Ready {
		t.Errorf("state=%q preparing=%+v, want the ready attempt kept for a desktop to start", got.State, got.Preparing)
	}
}
