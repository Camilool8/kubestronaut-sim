package session

import (
	"errors"
	"os"
	"testing"
)

// The mcq engine stores the candidate's selections in the session, which
// makes them the first candidate input this product persists. These tests
// pin the rules: writable only while running, sorted on write, cleared by
// Start and Reset, and durable across a process restart.

func TestSetAnswerRequiresRunning(t *testing.T) {
	clock, _ := fakeClock(epoch)
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	if err := m.SetAnswer("q01", []int{0}); !errors.Is(err, ErrConflict) {
		t.Errorf("SetAnswer while idle: err = %v, want ErrConflict", err)
	}

	if _, err := m.Start(ModeExam, testDur); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := m.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}
	if err := m.SetAnswer("q01", []int{0}); !errors.Is(err, ErrConflict) {
		t.Errorf("SetAnswer while ended: err = %v, want ErrConflict", err)
	}
}

func TestSetAnswerStoresSortedAndSurvivesReload(t *testing.T) {
	path := sessionPath(t)
	clock, _ := fakeClock(epoch)
	m, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(ModeExam, testDur); err != nil {
		t.Fatalf("Start: %v", err)
	}

	if err := m.SetAnswer("q03", []int{3, 1}); err != nil {
		t.Fatalf("SetAnswer: %v", err)
	}
	if err := m.SetAnswer("q01", []int{2}); err != nil {
		t.Fatalf("SetAnswer: %v", err)
	}

	got := m.Answers()
	if len(got) != 2 {
		t.Fatalf("len(Answers) = %d, want 2", len(got))
	}
	if a := got["q03"]; len(a) != 2 || a[0] != 1 || a[1] != 3 {
		t.Errorf("q03 = %v, want [1 3] (sorted on write)", a)
	}

	// A restart resumes the attempt with its answers intact.
	m2, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("reload New: %v", err)
	}
	got2 := m2.Answers()
	if a := got2["q03"]; len(a) != 2 || a[0] != 1 || a[1] != 3 {
		t.Errorf("after reload q03 = %v, want [1 3]", a)
	}
	if a := got2["q01"]; len(a) != 1 || a[0] != 2 {
		t.Errorf("after reload q01 = %v, want [2]", a)
	}
}

func TestSetAnswerEmptyClearsTheEntry(t *testing.T) {
	clock, _ := fakeClock(epoch)
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(ModeExam, testDur); err != nil {
		t.Fatalf("Start: %v", err)
	}

	if err := m.SetAnswer("q01", []int{0, 1}); err != nil {
		t.Fatalf("SetAnswer: %v", err)
	}
	if err := m.SetAnswer("q01", nil); err != nil {
		t.Fatalf("SetAnswer clear: %v", err)
	}
	if _, ok := m.Answers()["q01"]; ok {
		t.Errorf("q01 still present after clearing, want deleted")
	}
}

func TestAnswersReturnsACopy(t *testing.T) {
	clock, _ := fakeClock(epoch)
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(ModeExam, testDur); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := m.SetAnswer("q01", []int{0}); err != nil {
		t.Fatalf("SetAnswer: %v", err)
	}

	got := m.Answers()
	got["q01"][0] = 9
	got["q99"] = []int{1}

	fresh := m.Answers()
	if fresh["q01"][0] != 0 {
		t.Errorf("mutating the returned slice reached the manager: q01 = %v", fresh["q01"])
	}
	if _, ok := fresh["q99"]; ok {
		t.Errorf("mutating the returned map reached the manager: q99 present")
	}
}

func TestStartAndResetClearAnswers(t *testing.T) {
	clock, _ := fakeClock(epoch)
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(ModeExam, testDur); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := m.SetAnswer("q01", []int{0}); err != nil {
		t.Fatalf("SetAnswer: %v", err)
	}

	if err := m.Reset(); err != nil {
		t.Fatalf("Reset: %v", err)
	}
	if got := m.Answers(); len(got) != 0 {
		t.Errorf("Answers after Reset = %v, want empty", got)
	}

	// A new attempt must never inherit a previous attempt's selections.
	if _, err := m.Start(ModeExam, testDur); err != nil {
		t.Fatalf("second Start: %v", err)
	}
	if got := m.Answers(); len(got) != 0 {
		t.Errorf("Answers after fresh Start = %v, want empty", got)
	}
}

// Version 3 files predate answer storage; the version guard must discard
// them (the standing migration strategy), not resume them answerless.
// A drawn subset is what StartDraw adds over plain Start: it must
// persist and survive a reload exactly like mode and answers already do.
func TestStartDrawPersistsQuestionIDsAndReload(t *testing.T) {
	path := sessionPath(t)
	clock, _ := fakeClock(epoch)
	m, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	want := []string{"q03", "q01", "q07"}
	if _, err := m.StartDraw(ModeExam, testDur, Draw{QuestionIDs: want}); err != nil {
		t.Fatalf("StartDraw: %v", err)
	}
	if got := m.QuestionIDs(); !equalStrings(got, want) {
		t.Errorf("QuestionIDs() after StartDraw = %v, want %v", got, want)
	}

	m2, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New (reload): %v", err)
	}
	if got := m2.QuestionIDs(); !equalStrings(got, want) {
		t.Errorf("QuestionIDs() after reload = %v, want %v", got, want)
	}
}

// Plain Start is StartDraw with a zero Draw — every attempt that draws
// nothing must get no subset at all, not an empty-but-present one.
func TestPlainStartHasNoQuestionIDs(t *testing.T) {
	clock, _ := fakeClock(epoch)
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(ModeExam, testDur); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if got := m.QuestionIDs(); len(got) != 0 {
		t.Errorf("QuestionIDs() after plain Start = %v, want empty", got)
	}
}

// Reset clears the drawn subset along with everything else an attempt
// carries — the whole point is that the NEXT Start draws fresh, not that
// it inherits the previous attempt's questions.
func TestResetClearsQuestionIDs(t *testing.T) {
	clock, _ := fakeClock(epoch)
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.StartDraw(ModeExam, testDur, Draw{QuestionIDs: []string{"q01", "q02"}}); err != nil {
		t.Fatalf("StartDraw: %v", err)
	}
	if err := m.Reset(); err != nil {
		t.Fatalf("Reset: %v", err)
	}
	if got := m.QuestionIDs(); len(got) != 0 {
		t.Errorf("QuestionIDs() after Reset = %v, want empty", got)
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestVersion4FileIsDiscarded(t *testing.T) {
	path := sessionPath(t)
	doc := `{"version":4,"bank":"` + testBank + `","attempt":"tok","state":"running",` +
		`"startedAt":"2026-01-01T12:00:00Z","durationSeconds":7200,"endedAt":null,` +
		`"endReason":"","mode":"exam","gradeError":""}`
	if err := os.WriteFile(path, []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}

	clock, _ := fakeClock(epoch)
	m, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if snap := m.Snapshot(); snap.State != "idle" {
		t.Errorf("State after loading a v4 file = %q, want idle (discarded)", snap.State)
	}
}

func TestVersion3FileIsDiscarded(t *testing.T) {
	path := sessionPath(t)
	doc := `{"version":3,"bank":"` + testBank + `","attempt":"tok","state":"running",` +
		`"startedAt":"2026-01-01T12:00:00Z","durationSeconds":7200,"endedAt":null,` +
		`"endReason":"","mode":"exam","gradeError":""}`
	if err := os.WriteFile(path, []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}

	clock, _ := fakeClock(epoch)
	m, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if snap := m.Snapshot(); snap.State != "idle" {
		t.Errorf("State after loading a v3 file = %q, want idle (discarded)", snap.State)
	}
}
