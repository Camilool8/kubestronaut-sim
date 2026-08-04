package main

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"testing"
	"time"

	"kubestronaut-sim/facilitator/internal/evaluate"
	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/history"
	"kubestronaut-sim/facilitator/internal/session"
)

func newTestStore(t *testing.T) *history.Store {
	t.Helper()
	s, err := history.Open(filepath.Join(t.TempDir(), "history.json"))
	if err != nil {
		t.Fatalf("history.Open: %v", err)
	}
	return s
}

// gradedResults is a results value shaped like something evaluate.Grade
// would produce for a full 2-question attempt of testExam().
func gradedResults() *evaluate.Results {
	return &evaluate.Results{
		Bank:            "test-bank",
		GradedAt:        time.Date(2026, 3, 1, 10, 0, 0, 0, time.UTC),
		Earned:          8,
		Total:           10,
		Percent:         80,
		PointsPercent:   80,
		PassingScore:    66,
		Passed:          true,
		Mode:            session.ModeExam,
		Seed:            "abc123",
		DurationSeconds: 600,
		ElapsedSeconds:  540,
		Questions: []evaluate.QuestionResult{
			{ID: "q01", Domain: "Domain One", Earned: 5, Total: 5},
			{ID: "q02", Domain: "Domain Two", Earned: 3, Total: 5},
		},
		Domains: []evaluate.DomainResult{
			{Domain: "Domain One", Earned: 5, Total: 5, WeightPct: 50, QuestionCount: 1},
			{Domain: "Domain Two", Earned: 3, Total: 5, WeightPct: 50, QuestionCount: 1},
		},
	}
}

// recorderExam is testExam() plus the metadata a record copies in, and a
// second question so a full draw is 2 and a filtered one is 1.
func recorderExam() *exam.Exam {
	ex := testExam()
	ex.Certification = "CKAD"
	ex.PassingScore = 66
	ex.Type = exam.TypeHandsOn
	ex.Questions = append(ex.Questions, exam.Question{ID: "q02", Instance: "inst-1"})
	return ex
}

func TestRecordAttemptCopiesTheBankIn(t *testing.T) {
	store := newTestStore(t)
	ex := recorderExam()
	snap := session.Snapshot{State: "ended", Mode: session.ModeExam, StartedAt: time.Date(2026, 3, 1, 9, 0, 0, 0, time.UTC)}

	if err := recordAttempt(store, nil, ex, "tok-1", snap, gradedResults()); err != nil {
		t.Fatalf("recordAttempt: %v", err)
	}

	got := store.All()
	if len(got) != 1 {
		t.Fatalf("All() = %d records, want 1", len(got))
	}
	r := got[0]
	// Self-contained: the dashboard shows five certifications while only
	// one bank is loadable, so a record that pointed at its bank would
	// render as blanks for the other four.
	if r.Certification != "CKAD" || r.ExamTitle != "Test Exam" || r.ExamType != exam.TypeHandsOn {
		t.Errorf("record = %+v, want the bank's identity copied in", r)
	}
	if r.ID != "tok-1" {
		t.Errorf("id = %q, want the attempt token", r.ID)
	}
	if r.Percent != 80 || r.PassingScore != 66 || !r.Passed {
		t.Errorf("score fields = %d/%d passed=%v", r.Percent, r.PassingScore, r.Passed)
	}
	if r.QuestionCount != 2 {
		t.Errorf("questionCount = %d, want 2", r.QuestionCount)
	}
	if !r.Counted {
		t.Error("a full, unfiltered exam attempt was not counted")
	}
	if len(r.Domains) != 2 {
		t.Errorf("domains = %#v, want both copied in", r.Domains)
	}
	if !r.StartedAt.Equal(snap.StartedAt) || !r.GradedAt.Equal(gradedResults().GradedAt) {
		t.Errorf("timestamps = %v / %v", r.StartedAt, r.GradedAt)
	}
}

func TestRecordAttemptSkipsTraining(t *testing.T) {
	store := newTestStore(t)
	snap := session.Snapshot{State: "ended", Mode: session.ModeTraining}
	res := gradedResults()
	res.Mode = session.ModeTraining

	if err := recordAttempt(store, nil, recorderExam(), "tok-1", snap, res); err != nil {
		t.Fatalf("recordAttempt: %v", err)
	}
	if got := len(store.All()); got != 0 {
		t.Errorf("All() = %d, want 0 — training is practice, not a sitting", got)
	}
}

func TestRecordAttemptMarksAFilteredDrawUncounted(t *testing.T) {
	store := newTestStore(t)
	snap := session.Snapshot{State: "ended", Mode: session.ModeExam, DomainFilter: []string{"Domain One"}}
	res := gradedResults()
	res.DomainFilter = []string{"Domain One"}
	res.Questions = res.Questions[:1]
	res.Percent = 100
	res.Passed = true

	if err := recordAttempt(store, nil, recorderExam(), "tok-1", snap, res); err != nil {
		t.Fatalf("recordAttempt: %v", err)
	}
	got := store.All()
	if len(got) != 1 {
		t.Fatalf("All() = %d, want 1 — a drill is still recorded, just not counted", len(got))
	}
	if got[0].Counted {
		t.Error("a 100%% single-domain drill was counted; the dashboard would claim a CKAD pass")
	}
	// And it must not reach bestPercent or passed.
	p := history.Progress(got)
	if p.BestPercent != nil || p.Passed {
		t.Errorf("progress = %+v, want no best and not passed", p)
	}
}

func TestRecordAttemptIsIdempotent(t *testing.T) {
	store := newTestStore(t)
	snap := session.Snapshot{State: "ended", Mode: session.ModeExam}
	for i := 0; i < 3; i++ {
		if err := recordAttempt(store, nil, recorderExam(), "tok-1", snap, gradedResults()); err != nil {
			t.Fatalf("recordAttempt %d: %v", i, err)
		}
	}
	if got := len(store.All()); got != 1 {
		t.Errorf("All() = %d, want 1 — a recovery re-grade must not duplicate a sitting", got)
	}
}

func TestRecordAttemptWithoutATokenRefuses(t *testing.T) {
	store := newTestStore(t)
	snap := session.Snapshot{State: "ended", Mode: session.ModeExam}
	if err := recordAttempt(store, nil, recorderExam(), "", snap, gradedResults()); err == nil {
		t.Fatal("recordAttempt with no token returned nil; an id-less record cannot be de-duplicated")
	}
	if got := len(store.All()); got != 0 {
		t.Errorf("All() = %d, want 0", got)
	}
}

// A nil store (no state volume, a dev run) is not an error: the exam
// still runs, it just keeps no record.
func TestRecordAttemptWithNoStore(t *testing.T) {
	snap := session.Snapshot{State: "ended", Mode: session.ModeExam}
	if err := recordAttempt(nil, nil, recorderExam(), "tok-1", snap, gradedResults()); err != nil {
		t.Fatalf("recordAttempt with a nil store: %v", err)
	}
}

// The grader must record only what SetResults accepted, and a history
// failure must never turn a graded exam into a grading failure.
func TestGradeRecordsTheAttempt(t *testing.T) {
	mgr := newTestManager(t)
	store := newTestStore(t)
	ex := recorderExam()

	g := newGrader(ex, mgr, &countingRunner{}, time.Second)
	g.record = func(token string, snap session.Snapshot, res *evaluate.Results) error {
		return recordAttempt(store, nil, ex, token, snap, res)
	}
	g.Grade()

	waitFor(t, func() bool { return len(store.All()) == 1 })
	rec := store.All()[0]
	if rec.ID != mgr.AttemptToken() {
		t.Errorf("record id = %q, want the attempt token %q", rec.ID, mgr.AttemptToken())
	}
	if rec.Bank != "test-bank" {
		t.Errorf("record bank = %q", rec.Bank)
	}
}

func TestGradeSurvivesAHistoryWriteFailure(t *testing.T) {
	mgr := newTestManager(t)
	g := newGrader(recorderExam(), mgr, &countingRunner{}, time.Second)
	g.record = func(string, session.Snapshot, *evaluate.Results) error {
		return errRecorder
	}
	g.Grade()

	// The grade itself still lands: results set, no grade error.
	waitFor(t, func() bool {
		res, gradeErr, graded := mgr.Results()
		return graded && gradeErr == "" && len(res) > 0
	})
}

var errRecorder = errRecorderType("state volume is full")

type errRecorderType string

func (e errRecorderType) Error() string { return string(e) }

// waitFor polls cond for up to a second. The grading run is a goroutine,
// so there is no synchronous moment to assert at.
func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("condition never became true")
}

// newBanksFetcher must reach exactly one conductor route and treat
// anything other than 200 as an outage — the catalog degrades on it.
func TestNewBanksFetcher(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Write([]byte(`{"active":"a","banks":[]}`))
	}))
	defer srv.Close()

	base := mustParseURL(t, srv.URL)
	raw, err := newBanksFetcher(base, nil)(t.Context())
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if gotPath != "/api/control/banks" {
		t.Errorf("fetched %q, want /api/control/banks", gotPath)
	}
	if string(raw) != `{"active":"a","banks":[]}` {
		t.Errorf("body = %s", raw)
	}

	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusInternalServerError)
	}))
	defer bad.Close()
	if _, err := newBanksFetcher(mustParseURL(t, bad.URL), nil)(t.Context()); err == nil {
		t.Error("a 500 from the conductor was not reported as an error")
	}
}

func mustParseURL(t *testing.T, raw string) *url.URL {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse %s: %v", raw, err)
	}
	return u
}
