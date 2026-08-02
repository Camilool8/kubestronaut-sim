package api_test

import (
	"net/http"
	"testing"
	"time"
)

// sessionBody is the shared session shape plus the draw fields every
// endpoint that reports session state now carries.
type sessionBody struct {
	State            string   `json:"state"`
	Mode             string   `json:"mode"`
	Untimed          bool     `json:"untimed"`
	DurationSeconds  int      `json:"durationSeconds"`
	RemainingSeconds int      `json:"remainingSeconds"`
	ElapsedSeconds   int      `json:"elapsedSeconds"`
	Seed             string   `json:"seed"`
	PoolDigest       string   `json:"poolDigest"`
	DomainFilter     []string `json:"domainFilter"`
	PoolChanged      bool     `json:"poolChanged"`
}

type errorBody struct {
	Error string `json:"error"`
}

// `./sim` and tests/smoke.sh POST here with no body at all — no JSON, no
// Content-Type — and must keep working exactly as they did. This is the
// regression test for the request shape growing four optional fields.
func TestStartWithNoBodyStillWorks(t *testing.T) {
	ts := newTestServer(t)

	// do() sends a nil body, which is what curl -X POST with no -d does.
	rec := ts.do(t, http.MethodPost, "/api/session/start")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	got := decodeJSON[sessionBody](t, rec)

	if got.State != "running" {
		t.Errorf("state = %q, want running", got.State)
	}
	if got.Mode != "exam" {
		t.Errorf("mode = %q, want exam (the default an empty body means)", got.Mode)
	}
	// Every attempt has a seed whether or not the caller asked for one,
	// so every attempt is replayable after the fact.
	if len(got.Seed) != 6 {
		t.Errorf("seed = %q, want six hex digits minted for a body-less start", got.Seed)
	}
	if got.PoolDigest == "" {
		t.Error("poolDigest is empty, want the loaded bank's fingerprint")
	}
	if got.DomainFilter != nil {
		t.Errorf("domainFilter = %v, want absent (the whole curriculum)", got.DomainFilter)
	}
	if got.PoolChanged {
		t.Error("poolChanged = true on a start that supplied no digest")
	}
}

// A supplied seed is echoed back, and the same seed against an unchanged
// pool draws the same questions in the same order.
func TestStartSeedReplaysTheSameDraw(t *testing.T) {
	drawFor := func(seed string) []string {
		ts := newMCQPoolTestServer(t)
		rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam","seed":"`+seed+`"}`)
		if rec.Code != http.StatusOK {
			t.Fatalf("start: status = %d, body=%s", rec.Code, rec.Body.String())
		}
		if got := decodeJSON[sessionBody](t, rec).Seed; got != seed {
			t.Fatalf("seed = %q, want the supplied %q", got, seed)
		}
		exam := decodeJSON[examResponse](t, ts.do(t, http.MethodGet, "/api/exam"))
		ids := make([]string, 0, len(exam.Questions))
		for _, q := range exam.Questions {
			ids = append(ids, q.ID)
		}
		return ids
	}

	first := drawFor("a1b2c3")
	second := drawFor("a1b2c3")
	if len(first) != 5 {
		t.Fatalf("drew %d questions, want 5", len(first))
	}
	for i := range first {
		if first[i] != second[i] {
			t.Fatalf("same seed drew different sets:\n first  = %v\n second = %v", first, second)
		}
	}

	if other := drawFor("ffeedd"); len(other) == len(first) {
		same := true
		for i := range other {
			if other[i] != first[i] {
				same = false
				break
			}
		}
		if same {
			t.Error("two different seeds drew the identical set — the seed is not reaching the draw")
		}
	}
}

// A candidate replaying a seed against a bank that has since changed is
// not refused: the draw is still deterministic, it is simply no longer
// the same set, and starting the attempt with a warning beats handing
// them nothing at all. poolChanged is a fact about the REQUEST, so it
// appears on the start response and nowhere else.
func TestStartReportsPoolChangedWithoutRefusing(t *testing.T) {
	ts := newMCQPoolTestServer(t)
	rec := ts.doJSON(t, http.MethodPost, "/api/session/start",
		`{"mode":"exam","seed":"a1b2c3","poolDigest":"000000000000"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (a stale digest must not refuse), body=%s", rec.Code, rec.Body.String())
	}
	got := decodeJSON[sessionBody](t, rec)
	if !got.PoolChanged {
		t.Error("poolChanged = false, want true for a digest that does not match the loaded bank")
	}
	if got.State != "running" {
		t.Errorf("state = %q, want running", got.State)
	}
	if got.PoolDigest == "000000000000" {
		t.Error("poolDigest echoed the stale value back; it must report the pool actually drawn from")
	}

	// And the attempt itself records nothing about the mismatch: it is an
	// ordinary attempt that simply is not the set the seed produced last
	// time.
	after := decodeJSON[sessionBody](t, ts.do(t, http.MethodGet, "/api/session"))
	if after.PoolChanged {
		t.Error("GET /api/session reports poolChanged; it belongs to the start request only")
	}
}

// The matching digest is the ordinary replay, and says so by staying
// quiet.
func TestStartWithMatchingDigestIsNotAChange(t *testing.T) {
	ts := newMCQPoolTestServer(t)
	first := decodeJSON[sessionBody](t, ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam"}`))
	if first.PoolDigest == "" {
		t.Fatal("no poolDigest on the first start")
	}
	if rec := ts.do(t, http.MethodDelete, "/api/session"); rec.Code != http.StatusNoContent {
		t.Fatalf("reset: status = %d", rec.Code)
	}

	rec := ts.doJSON(t, http.MethodPost, "/api/session/start",
		`{"mode":"exam","seed":"`+first.Seed+`","poolDigest":"`+first.PoolDigest+`"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	if decodeJSON[sessionBody](t, rec).PoolChanged {
		t.Error("poolChanged = true for a digest that matches the loaded bank")
	}
}

// A domain the bank does not have is the caller's mistake and gets a
// 400 naming it — never a silently empty attempt that looks like a
// working exam right up until the score.
func TestStartUnknownDomainIs400(t *testing.T) {
	ts := newMCQPoolTestServer(t)
	rec := ts.doJSON(t, http.MethodPost, "/api/session/start",
		`{"mode":"exam","domains":["Domain A","Domain Q"]}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400, body=%s", rec.Code, rec.Body.String())
	}
	if msg := decodeJSON[errorBody](t, rec).Error; msg == "" {
		t.Error("400 body carried no error message")
	}

	// And nothing was started.
	if got := decodeJSON[sessionBody](t, ts.do(t, http.MethodGet, "/api/session")).State; got != "idle" {
		t.Errorf("state = %q after a rejected start, want idle", got)
	}
}

func TestStartMalformedSeedIs400(t *testing.T) {
	ts := newMCQPoolTestServer(t)
	rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam","seed":"NOPE"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400, body=%s", rec.Code, rec.Body.String())
	}
}

// A domain filter narrows an mcq draw to the named domains, and the
// attempt is scoped to it everywhere: /api/exam lists only those
// questions, and a question from the excluded domain is a 404.
func TestStartDomainFilterNarrowsMCQ(t *testing.T) {
	ts := newMCQPoolTestServer(t)
	rec := ts.doJSON(t, http.MethodPost, "/api/session/start",
		`{"mode":"exam","seed":"a1b2c3","domains":["Domain B"]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	got := decodeJSON[sessionBody](t, rec)
	if len(got.DomainFilter) != 1 || got.DomainFilter[0] != "Domain B" {
		t.Errorf("domainFilter = %v, want [Domain B]", got.DomainFilter)
	}

	list := decodeJSON[examResponse](t, ts.do(t, http.MethodGet, "/api/exam"))
	// Domain B holds 4 of the 9 pool questions, and 4 < the declared
	// length of 5, so the filtered attempt is all of them.
	if len(list.Questions) != 4 {
		t.Fatalf("len(questions) = %d, want Domain B's 4", len(list.Questions))
	}
	for _, q := range list.Questions {
		if q.Domain != "Domain B" {
			t.Errorf("question %s is in domain %q, outside the filter", q.ID, q.Domain)
		}
	}
	if rec := ts.do(t, http.MethodGet, "/api/questions/a1"); rec.Code != http.StatusNotFound {
		t.Errorf("GET a filtered-out question: status = %d, want 404", rec.Code)
	}
}

// The filter reaches the hands-on engine too. Narrowing which questions
// an attempt contains is free there — bootstrap.sh seeds every question
// in the bank into the cluster at boot whatever the draw is — so the
// cluster a filtered attempt sees is identical to an unfiltered one's.
func TestStartDomainFilterNarrowsHandsOn(t *testing.T) {
	ts := newTestServer(t)
	rec := ts.doJSON(t, http.MethodPost, "/api/session/start",
		`{"mode":"exam","domains":["Domain Two"]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	if got := decodeJSON[sessionBody](t, rec).DomainFilter; len(got) != 1 || got[0] != "Domain Two" {
		t.Errorf("domainFilter = %v, want [Domain Two]", got)
	}

	list := decodeJSON[examResponse](t, ts.do(t, http.MethodGet, "/api/exam"))
	if len(list.Questions) != 1 || list.Questions[0].ID != "q02" {
		t.Fatalf("questions = %+v, want only q02", list.Questions)
	}
	if rec := ts.do(t, http.MethodGet, "/api/questions/q01"); rec.Code != http.StatusNotFound {
		t.Errorf("GET a filtered-out hands-on question: status = %d, want 404", rec.Code)
	}
}

// GET /api/exam publishes the curriculum a draw configurator picks from.
// It must be computed from the FULL pool even once an attempt has
// narrowed `questions` to its drawn subset — otherwise the configurator
// would show the questions already drawn as if they were the whole
// curriculum.
func TestExamDomainsComeFromTheFullPool(t *testing.T) {
	ts := newMCQPoolTestServer(t)

	before := decodeJSON[examResponse](t, ts.do(t, http.MethodGet, "/api/exam"))
	want := []struct {
		name   string
		weight int
		count  int
	}{{"Domain A", 60, 5}, {"Domain B", 40, 4}}
	if len(before.Domains) != len(want) {
		t.Fatalf("domains = %+v, want %d entries", before.Domains, len(want))
	}
	for i, w := range want {
		got := before.Domains[i]
		if got.Name != w.name || got.WeightPct != w.weight || got.QuestionCount != w.count {
			t.Errorf("domains[%d] = %+v, want {%s %d %d}", i, got, w.name, w.weight, w.count)
		}
	}

	startMCQ(t, ts)
	after := decodeJSON[examResponse](t, ts.do(t, http.MethodGet, "/api/exam"))
	if len(after.Questions) != 5 {
		t.Fatalf("len(questions) = %d, want the drawn 5 — the premise of this test", len(after.Questions))
	}
	for i, w := range want {
		if got := after.Domains[i].QuestionCount; got != w.count {
			t.Errorf("after start: domains[%d].questionCount = %d, want the pool's %d", i, got, w.count)
		}
	}
}

// A derived target must be labelled as derived: it is arithmetic about
// weights, not anyone's judgement of how long the work takes, and a
// display that cannot tell them apart states the second with the first's
// confidence.
func TestExamTargetSecondsAreDerivedAndLabelled(t *testing.T) {
	ts := newTestServer(t)
	got := decodeJSON[examResponse](t, ts.do(t, http.MethodGet, "/api/exam"))
	if len(got.Questions) != 2 {
		t.Fatalf("len(questions) = %d, want 2", len(got.Questions))
	}
	// The fixture is a 10-minute exam over 8 points: q01's 5 are 375s.
	q01 := got.Questions[0]
	if q01.TargetSeconds != 375 || !q01.TargetDerived {
		t.Errorf("q01 target = %ds (derived=%v), want 375s derived", q01.TargetSeconds, q01.TargetDerived)
	}
	q02 := got.Questions[1]
	if q02.TargetSeconds != 225 || !q02.TargetDerived {
		t.Errorf("q02 target = %ds (derived=%v), want 225s derived", q02.TargetSeconds, q02.TargetDerived)
	}
}

// The whole reason elapsedSeconds exists: an untimed attempt reports
// durationSeconds and remainingSeconds as 0, so their difference says
// nothing about how long the candidate has been going.
func TestSessionElapsedSecondsOnUntimedAttempt(t *testing.T) {
	ts := newTestServer(t)
	if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"training"}`); rec.Code != http.StatusOK {
		t.Fatalf("start: status = %d, body=%s", rec.Code, rec.Body.String())
	}

	ts.setNow(epoch.Add(17 * time.Minute))
	got := decodeJSON[sessionBody](t, ts.do(t, http.MethodGet, "/api/session"))
	if !got.Untimed {
		t.Fatal("untimed = false, want true")
	}
	if got.DurationSeconds != 0 || got.RemainingSeconds != 0 {
		t.Fatalf("duration/remaining = %d/%d, want 0/0 — the premise of this test",
			got.DurationSeconds, got.RemainingSeconds)
	}
	if got.ElapsedSeconds != 1020 {
		t.Errorf("elapsedSeconds = %d, want 1020", got.ElapsedSeconds)
	}
}

// PUT /api/session/focus is the client saying which task is on screen.
// The server owns the clock: the request carries a question id and
// nothing else.
func TestFocusAccruesTimeAndIsScopedToTheDraw(t *testing.T) {
	ts := newMCQPoolTestServer(t)

	// 409 before there is an attempt to spend time inside.
	if rec := ts.doJSON(t, http.MethodPut, "/api/session/focus", `{"question":"a1"}`); rec.Code != http.StatusConflict {
		t.Errorf("focus while idle: status = %d, want 409", rec.Code)
	}

	startMCQ(t, ts)
	list := decodeJSON[examResponse](t, ts.do(t, http.MethodGet, "/api/exam"))
	drawn := map[string]bool{}
	for _, q := range list.Questions {
		drawn[q.ID] = true
	}
	var inDraw, outOfDraw string
	for _, id := range []string{"a1", "a2", "a3", "a4", "a5", "b1", "b2", "b3", "b4"} {
		if drawn[id] && inDraw == "" {
			inDraw = id
		}
		if !drawn[id] && outOfDraw == "" {
			outOfDraw = id
		}
	}
	if inDraw == "" || outOfDraw == "" {
		t.Fatalf("fixture: inDraw=%q outOfDraw=%q, want both", inDraw, outOfDraw)
	}

	if rec := ts.doJSON(t, http.MethodPut, "/api/session/focus", `{"question":"`+inDraw+`"}`); rec.Code != http.StatusOK {
		t.Fatalf("focus a drawn question: status = %d, body=%s", rec.Code, rec.Body.String())
	}
	// A pool question this attempt never contained is a 404, exactly as
	// it is on every other single-question endpoint: time cannot have
	// been spent on a question that was never on screen.
	if rec := ts.doJSON(t, http.MethodPut, "/api/session/focus", `{"question":"`+outOfDraw+`"}`); rec.Code != http.StatusNotFound {
		t.Errorf("focus a question outside the draw: status = %d, want 404", rec.Code)
	}
	if rec := ts.doJSON(t, http.MethodPut, "/api/session/focus", `{}`); rec.Code != http.StatusBadRequest {
		t.Errorf("focus with no question: status = %d, want 400", rec.Code)
	}

	ts.setNow(epoch.Add(45 * time.Second))
	if rec := ts.doJSON(t, http.MethodPut, "/api/session/focus", `{"question":"`+inDraw+`"}`); rec.Code != http.StatusOK {
		t.Fatalf("focus (repeat): status = %d", rec.Code)
	}
	if got := ts.mgr.TimeSpent()[inDraw]; got != 45 {
		t.Errorf("time on %s = %ds, want 45s", inDraw, got)
	}
}

// GET /api/exam's questionCount is what every count display reads — the
// lobby stat, the exam cards, "Question 1 of N" in both engines — so it
// has to describe the attempt a candidate is actually sitting, not the
// bank it came from.
//
// A domain filter is where the two diverge. It can leave a pool too
// shallow to draw the declared length from, and a filtered hands-on
// attempt has no declared length at all; before this was pinned, both
// reported the whole bank's size while serving a narrower subset.
func TestQuestionCountFollowsTheDraw(t *testing.T) {
	t.Run("handsOn", func(t *testing.T) {
		ts := newTestServer(t)
		rec := ts.doJSON(t, http.MethodPost, "/api/session/start",
			`{"mode":"exam","domains":["Domain Two"]}`)
		if rec.Code != http.StatusOK {
			t.Fatalf("start: %d %s", rec.Code, rec.Body.String())
		}
		list := decodeJSON[examResponse](t, ts.do(t, http.MethodGet, "/api/exam"))
		if list.QuestionCount != len(list.Questions) {
			t.Errorf("questionCount = %d, lists %d questions", list.QuestionCount, len(list.Questions))
		}
		if list.QuestionCount != 1 {
			t.Errorf("questionCount = %d, want 1 (only Domain Two was drawn)", list.QuestionCount)
		}
	})

	// Idle keeps the old meaning: there is no draw yet, so a pooled bank
	// must advertise the length an attempt WILL be, never its pool size.
	t.Run("idlePooledBankStillAdvertisesItsLength", func(t *testing.T) {
		ts := newMCQPoolTestServer(t)
		list := decodeJSON[examResponse](t, ts.do(t, http.MethodGet, "/api/exam"))
		if list.QuestionCount != 5 {
			t.Errorf("questionCount = %d, want 5 (examLength, not the 9-question pool)", list.QuestionCount)
		}
		if len(list.Questions) != 9 {
			t.Errorf("idle questions = %d, want the whole 9-question pool", len(list.Questions))
		}
	})
}
