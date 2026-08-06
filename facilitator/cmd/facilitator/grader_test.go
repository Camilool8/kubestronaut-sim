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

type countingRunner struct {
	calls atomic.Int32
}

func (r *countingRunner) Run(_ context.Context, _, _ string) (string, bool, error) {
	r.calls.Add(1)
	return "ok", true, nil
}

type panickingRunner struct {
	calls atomic.Int32
}

func (r *panickingRunner) Run(_ context.Context, _, _ string) (string, bool, error) {
	r.calls.Add(1)
	panic("boom: simulated grading failure")
}

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

func TestGradeNoOpWhileInFlight(t *testing.T) {
	mgr := newTestManager(t)
	runner := &countingRunner{}
	g := newGrader(testExam(), mgr, runner, time.Second)

	g.inFlight.Store(true)
	g.Grade()

	if got := runner.calls.Load(); got != 0 {
		t.Errorf("Runner.Run calls after Grade() while already in flight = %d, want 0 (must no-op, not run a second concurrent grade)", got)
	}
}

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

	g.Grade()
	waitForCalls(t, &runner.calls, 2)
}

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

	g.Grade()
	waitForCalls(t, &runner.calls, 2)
}

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

func mcqPooledTestExam() *exam.Exam {
	return &exam.Exam{
		Name: "test-bank",
		Type: exam.TypeMCQ,
		Questions: []exam.Question{
			{ID: "q01", Weight: 1, Options: []string{"a", "b", "c"}, Correct: []int{1}},
			{ID: "q02", Weight: 1, Options: []string{"a", "b", "c"}, Correct: []int{0}},
			{ID: "q03", Weight: 1, Options: []string{"a", "b", "c"}, Correct: []int{2}},
		},
	}
}

func TestGradeMCQPooledAttemptScoresOnlyItsDrawnSubset(t *testing.T) {
	mgr, err := session.New(t.TempDir()+"/session.json", "test-bank", time.Hour, time.Now, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}
	if _, err := mgr.StartDraw(session.ModeExam, time.Hour, session.Draw{QuestionIDs: []string{"q01", "q03"}}); err != nil {
		t.Fatalf("StartDraw: %v", err)
	}
	if err := mgr.SetAnswer("q01", []int{1}); err != nil {
		t.Fatalf("SetAnswer q01: %v", err)
	}
	if err := mgr.SetAnswer("q03", []int{2}); err != nil {
		t.Fatalf("SetAnswer q03: %v", err)
	}
	if err := mgr.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}

	runner := &countingRunner{}
	g := newGrader(mcqPooledTestExam(), mgr, runner, time.Second)
	g.Grade()
	waitForGraded(t, mgr)

	raw, gradeErr, _ := mgr.Results()
	if gradeErr != "" {
		t.Fatalf("gradeError = %q, want empty", gradeErr)
	}
	if !strings.Contains(string(raw), `"total":2`) {
		t.Errorf("results JSON = %s, want total 2 (only the drawn q01+q03; q02 excluded)", raw)
	}
	if !strings.Contains(string(raw), `"percent":100`) {
		t.Errorf("results JSON = %s, want percent 100 (both drawn questions answered correctly)", raw)
	}
	if strings.Contains(string(raw), `"id":"q02"`) {
		t.Errorf("results JSON = %s, must not mention q02 — it was outside the drawn subset", raw)
	}
}

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
