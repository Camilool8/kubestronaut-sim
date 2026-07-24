package main

import (
	"context"
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

func newTestManager(t *testing.T) *session.Manager {
	t.Helper()
	mgr, err := session.New(t.TempDir()+"/session.json", time.Hour, time.Now, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
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
