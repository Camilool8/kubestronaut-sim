package main

import (
	"context"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/session"
)

// countingRunner records how many times Run was invoked and always
// reports a passing check, so grader tests can assert exactly how many
// real grading attempts happened without any ssh/network involved.
type countingRunner struct {
	calls atomic.Int32
}

func (r *countingRunner) Run(_ context.Context, _, _ string) (string, bool, error) {
	r.calls.Add(1)
	return "ok", true, nil
}

// panickingRunner records how many times Run was invoked and always
// panics, simulating a bug or unexpected failure deep inside a
// grading run (e.g. in evaluate.Grade or one of its dependencies).
type panickingRunner struct {
	calls atomic.Int32
}

func (r *panickingRunner) Run(_ context.Context, _, _ string) (string, bool, error) {
	r.calls.Add(1)
	panic("boom: simulated grading failure")
}

// testExam is a minimal hand-built *exam.Exam (no bank dir / JSON
// fixture needed — evaluate.Grade only calls the Runner, it never
// touches disk) with one question and one check, enough for grader
// tests to exercise a real evaluate.Grade + SetResults round trip.
func testExam() *exam.Exam {
	return &exam.Exam{
		Name:  "test-bank",
		Title: "Test Exam",
		Questions: []exam.Question{
			{
				ID:       "q01",
				Instance: "inst-1",
				Checks:   []exam.Check{{Name: "10_a.sh", Desc: "a", Points: 1}},
			},
		},
	}
}

// newTestManager returns a Manager already Start()ed and End()ed, i.e.
// in the "ended" state Grade's real callers always put it in before
// invoking Grade (the end-session handler calls it only after
// Manager.End succeeds; the expiry timer's onExpire fires after the
// session has transitioned to ended too). SetResults/SetGradeError
// reject writes unless the session is currently ended, so grader tests
// that skip this setup would see every Grade() run's outcome silently
// rejected as ErrConflict instead of recorded.
func newTestManager(t *testing.T) *session.Manager {
	t.Helper()
	mgr, err := session.New(t.TempDir()+"/session.json", "test-bank", time.Hour, time.Now, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}
	if _, err := mgr.Start(session.ModeExam, time.Hour); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := mgr.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}
	return mgr
}

// TestGradeNoOpWhileInFlight is the deterministic core of the
// double-grading guard: it forces the in-flight flag on directly
// (simulating a grade already running, however it got started —
// end-endpoint or expiry timer) and asserts a subsequent Grade() call
// never even reaches the Runner. Because the CAS check runs
// synchronously before the grading goroutine is spawned, this needs no
// waiting/polling to be exact: either the Runner was called or it
// wasn't.
func TestGradeNoOpWhileInFlight(t *testing.T) {
	mgr := newTestManager(t)
	runner := &countingRunner{}
	g := newGrader(testExam(), mgr, runner, time.Second)

	g.inFlight.Store(true) // simulate: a grade is already running
	g.Grade()

	if got := runner.calls.Load(); got != 0 {
		t.Errorf("Runner.Run calls after Grade() while already in flight = %d, want 0 (must no-op, not run a second concurrent grade)", got)
	}
}

// TestGradeSequentialRunsRecordResultsAndClearInFlight exercises the
// full real path end to end: Grade() actually runs evaluate.Grade,
// records the results on the Manager, and — critically for the
// end-endpoint's re-grade recovery path — clears the in-flight flag
// afterward so a later Grade() call (e.g. a second POST
// /api/session/end after a first grading attempt failed) is not
// permanently blocked.
func TestGradeSequentialRunsRecordResultsAndClearInFlight(t *testing.T) {
	mgr := newTestManager(t)
	runner := &countingRunner{}
	g := newGrader(testExam(), mgr, runner, time.Second)

	g.Grade()
	waitForGraded(t, mgr)

	results, gradeErr, graded := mgr.Results()
	if !graded {
		t.Fatal("Results() graded = false after Grade() completed")
	}
	if gradeErr != "" {
		t.Fatalf("gradeError = %q, want empty (grading a passing check should succeed)", gradeErr)
	}
	if len(results) == 0 {
		t.Error("results is empty after a successful grade")
	}
	if g.inFlight.Load() {
		t.Fatal("inFlight still true after grading completed, want false (a re-grade must not be permanently blocked)")
	}

	g.Grade() // sequential re-grade must actually run again, not no-op
	waitForCalls(t, &runner.calls, 2)
}

// TestGradePanicRecoveredAndAllowsRegrade is the panic-safety
// counterpart to the double-grading guard tests above: the design doc
// guarantees an evaluator failure never crashes the facilitator, so a
// panic anywhere inside the async grading goroutine (here, simulated
// via a Runner that panics) must be recovered, recorded as a
// gradeError, and — just as importantly — must not leave the in-flight
// flag stuck, so a client re-POSTing end can still trigger a working
// re-grade. The test itself surviving to its final assertions is
// itself proof the process didn't crash: an unrecovered panic in this
// goroutine would take the whole test binary down with it.
func TestGradePanicRecoveredAndAllowsRegrade(t *testing.T) {
	mgr := newTestManager(t)
	runner := &panickingRunner{}
	g := newGrader(testExam(), mgr, runner, time.Second)

	g.Grade()
	waitForCalls(t, &runner.calls, 1)
	waitForGraded(t, mgr)

	_, gradeErr, graded := mgr.Results()
	if !graded {
		t.Fatal("Results() graded = false after a panicking grade, want true (gradeError recorded)")
	}
	if gradeErr == "" {
		t.Fatal("gradeError empty after a panicking grade, want a message describing the panic")
	}
	if !strings.Contains(gradeErr, "panic") {
		t.Errorf("gradeError = %q, want it to mention the panic", gradeErr)
	}
	if g.inFlight.Load() {
		t.Fatal("inFlight still true after a panicking grade, want false (must allow a re-grade, not wedge forever)")
	}

	// Re-POST /api/session/end after a failed grade must actually
	// re-run, not silently no-op because of a stuck in-flight flag.
	g.Grade()
	waitForCalls(t, &runner.calls, 2)
}

// waitForGraded polls Manager.Results until grading has reached a
// terminal outcome, failing the test if it never does within a
// generous bound. Grade() runs on its own goroutine, so some form of
// wait is unavoidable; this polls rather than sleeping a fixed amount,
// so it finishes as soon as the real work is done.
func waitForGraded(t *testing.T, mgr *session.Manager) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if _, _, graded := mgr.Results(); graded {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("grading did not complete within 2s")
}

// waitForCalls polls until counter reaches at least want, failing if it
// never does within a generous bound.
func waitForCalls(t *testing.T, counter *atomic.Int32, want int32) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if counter.Load() >= want {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("Runner.Run calls = %d after 2s, want >= %d", counter.Load(), want)
}

// mcqTestExam is a minimal mcq exam for grader-branch tests: two
// one-point questions.
func mcqTestExam() *exam.Exam {
	return &exam.Exam{
		Name: "test-bank",
		Type: exam.TypeMCQ,
		Questions: []exam.Question{
			{ID: "q01", Weight: 1, Options: []string{"a", "b", "c"}, Correct: []int{1}},
			{ID: "q02", Weight: 1, Options: []string{"a", "b", "c"}, Correct: []int{0}},
		},
	}
}

// TestGradeMCQUsesStoredAnswersAndNeverSSH pins the engine branch: an
// mcq exam grades the session's stored answers purely — the ssh Runner
// must never be consulted — and records the same Results schema the
// hands-on path does.
func TestGradeMCQUsesStoredAnswersAndNeverSSH(t *testing.T) {
	mgr, err := session.New(t.TempDir()+"/session.json", "test-bank", time.Hour, time.Now, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}
	if _, err := mgr.Start(session.ModeExam, time.Hour); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := mgr.SetAnswer("q01", []int{1}); err != nil {
		t.Fatalf("SetAnswer: %v", err)
	}
	if err := mgr.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}

	runner := &countingRunner{}
	g := newGrader(mcqTestExam(), mgr, runner, time.Second)
	g.Grade()
	waitForGraded(t, mgr)

	if got := runner.calls.Load(); got != 0 {
		t.Errorf("Runner.Run calls during an mcq grade = %d, want 0", got)
	}
	raw, gradeErr, _ := mgr.Results()
	if gradeErr != "" {
		t.Fatalf("gradeError = %q, want empty", gradeErr)
	}
	if !strings.Contains(string(raw), `"percent":50`) {
		t.Errorf("results JSON = %s, want percent 50 (1 of 2 answered correctly)", raw)
	}
	if !strings.Contains(string(raw), `"selected":[1]`) {
		t.Errorf("results JSON = %s, want q01's selected [1] embedded for review", raw)
	}
}

// TestPracticeGradeMCQ pins training mode's "score my work": pure,
// instant, never persisted, no ssh.
func TestPracticeGradeMCQ(t *testing.T) {
	mgr, err := session.New(t.TempDir()+"/session.json", "test-bank", time.Hour, time.Now, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}
	if _, err := mgr.Start(session.ModeTraining, 0); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := mgr.SetAnswer("q01", []int{1}); err != nil {
		t.Fatalf("SetAnswer: %v", err)
	}
	if err := mgr.SetAnswer("q02", []int{0}); err != nil {
		t.Fatalf("SetAnswer: %v", err)
	}

	runner := &countingRunner{}
	g := newGrader(mcqTestExam(), mgr, runner, time.Second)
	raw, err := g.PracticeGrade()
	if err != nil {
		t.Fatalf("PracticeGrade: %v", err)
	}
	if got := runner.calls.Load(); got != 0 {
		t.Errorf("Runner.Run calls during an mcq practice grade = %d, want 0", got)
	}
	if !strings.Contains(string(raw), `"percent":100`) {
		t.Errorf("practice results = %s, want percent 100", raw)
	}
	if results, _, graded := mgr.Results(); graded {
		t.Errorf("practice grade persisted results (%s), want nothing recorded", results)
	}
}
