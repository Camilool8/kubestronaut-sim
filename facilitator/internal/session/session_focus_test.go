package session

import (
	"errors"
	"testing"
	"time"
)

// Per-task timing is server-measured: the client reports which question
// is on screen and nothing else, and the manager decides how long that
// was worth. These tests pin the rules — accrual to the PREVIOUS
// question, the 90-second cap on any one gap, the deliberate refusal to
// bill downtime across a restart, and the final interval being closed
// when the attempt ends.

func TestFocusAccruesToThePreviousQuestion(t *testing.T) {
	clock, setNow := fakeClock(epoch)
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(ModeExam, testDur); err != nil {
		t.Fatalf("Start: %v", err)
	}

	// The first report opens an interval and credits nothing: there is no
	// previous question for the time before it to belong to.
	if err := m.Focus("q01"); err != nil {
		t.Fatalf("Focus q01: %v", err)
	}
	if got := m.TimeSpent(); len(got) != 0 {
		t.Errorf("TimeSpent after the first report = %v, want empty", got)
	}

	setNow(epoch.Add(30 * time.Second))
	if err := m.Focus("q01"); err != nil {
		t.Fatalf("Focus q01 (repeat): %v", err)
	}
	setNow(epoch.Add(50 * time.Second))
	if err := m.Focus("q02"); err != nil {
		t.Fatalf("Focus q02: %v", err)
	}
	setNow(epoch.Add(65 * time.Second))
	if err := m.Focus("q01"); err != nil {
		t.Fatalf("Focus q01 (back): %v", err)
	}

	got := m.TimeSpent()
	// q01 held the screen 0-30, 30-50 and then q02 held it 50-65.
	if got["q01"] != 50 {
		t.Errorf("q01 = %ds, want 50s", got["q01"])
	}
	if got["q02"] != 15 {
		t.Errorf("q02 = %ds, want 15s", got["q02"])
	}
}

// A candidate who closes the tab overnight and comes back must be
// credited with a minute and a half, not nine hours. The cap is what
// keeps "time this question was open" from degenerating into "time
// between two page loads".
func TestFocusCapsALongGap(t *testing.T) {
	clock, setNow := fakeClock(epoch)
	m, err := New(sessionPath(t), testBank, 0, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	// Untimed, so a five-hour gap does not simply expire the attempt.
	if _, err := m.Start(ModeTraining, 0); err != nil {
		t.Fatalf("Start: %v", err)
	}

	if err := m.Focus("q01"); err != nil {
		t.Fatalf("Focus q01: %v", err)
	}
	setNow(epoch.Add(5 * time.Hour))
	if err := m.Focus("q02"); err != nil {
		t.Fatalf("Focus q02: %v", err)
	}

	if got := m.TimeSpent()["q01"]; got != 90 {
		t.Errorf("q01 after a five-hour gap = %ds, want 90s (the cap)", got)
	}
}

// The last question a candidate looked at is usually the one they
// submitted from, so its final interval is the only one it ever had.
// Ending the attempt has to close it.
func TestEndClosesTheOpenFocusInterval(t *testing.T) {
	clock, setNow := fakeClock(epoch)
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(ModeExam, testDur); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := m.Focus("q07"); err != nil {
		t.Fatalf("Focus: %v", err)
	}
	setNow(epoch.Add(40 * time.Second))
	if err := m.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}

	if got := m.TimeSpent()["q07"]; got != 40 {
		t.Errorf("q07 after End = %ds, want 40s", got)
	}
}

// The accrual survives a restart; the OPEN interval deliberately does
// not. Persisting focusSince would bill a candidate for however long the
// facilitator was down, which is the one stretch of time they certainly
// were not looking at the question.
func TestFocusSurvivesReloadButTheOpenIntervalDoesNot(t *testing.T) {
	path := sessionPath(t)
	clock, setNow := fakeClock(epoch)
	m, err := New(path, testBank, 0, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(ModeTraining, 0); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := m.Focus("q01"); err != nil {
		t.Fatalf("Focus q01: %v", err)
	}
	setNow(epoch.Add(20 * time.Second))
	if err := m.Focus("q02"); err != nil {
		t.Fatalf("Focus q02: %v", err)
	}

	// The process goes away for an hour with q02 still open.
	setNow(epoch.Add(time.Hour))
	m2, err := New(path, testBank, 0, clock, func() {})
	if err != nil {
		t.Fatalf("New (reload): %v", err)
	}

	got := m2.TimeSpent()
	if got["q01"] != 20 {
		t.Errorf("q01 after reload = %ds, want the 20s accrued before the restart", got["q01"])
	}
	if _, billed := got["q02"]; billed {
		t.Errorf("q02 = %ds after a restart, want nothing: the downtime is not time on the question", got["q02"])
	}

	// And the next report opens a fresh interval rather than back-billing.
	setNow(epoch.Add(time.Hour + 10*time.Second))
	if err := m2.Focus("q02"); err != nil {
		t.Fatalf("Focus after reload: %v", err)
	}
	if _, billed := m2.TimeSpent()["q02"]; billed {
		t.Error("the first report after a reload billed the downtime")
	}
}

// Time can only be spent inside a running attempt.
func TestFocusRequiresRunning(t *testing.T) {
	clock, _ := fakeClock(epoch)
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if err := m.Focus("q01"); !errors.Is(err, ErrConflict) {
		t.Errorf("Focus while idle: err = %v, want ErrConflict", err)
	}
	if _, err := m.Start(ModeExam, testDur); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := m.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}
	if err := m.Focus("q01"); !errors.Is(err, ErrConflict) {
		t.Errorf("Focus while ended: err = %v, want ErrConflict", err)
	}
}

// Start and Reset both clear the accrual: a new attempt starts at zero,
// and an abandoned one leaves nothing behind for the next.
func TestStartAndResetClearTimeSpent(t *testing.T) {
	clock, setNow := fakeClock(epoch)
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(ModeExam, testDur); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := m.Focus("q01"); err != nil {
		t.Fatalf("Focus: %v", err)
	}
	setNow(epoch.Add(30 * time.Second))
	if err := m.Reset(); err != nil {
		t.Fatalf("Reset: %v", err)
	}
	if got := m.TimeSpent(); len(got) != 0 {
		t.Errorf("TimeSpent after Reset = %v, want empty", got)
	}

	if _, err := m.Start(ModeExam, testDur); err != nil {
		t.Fatalf("Start (second): %v", err)
	}
	if err := m.Focus("q01"); err != nil {
		t.Fatalf("Focus (second attempt): %v", err)
	}
	setNow(epoch.Add(90 * time.Second))
	if err := m.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}
	if got := m.TimeSpent()["q01"]; got != 60 {
		t.Errorf("q01 = %ds, want only the 60s of the second attempt", got)
	}
}

// ElapsedSeconds exists because durationSeconds - remainingSeconds is
// the elapsed time of a TIMED attempt only: training reports both as 0,
// and this is the only thing that can say how long it has been going.
func TestSnapshotElapsedSeconds(t *testing.T) {
	clock, setNow := fakeClock(epoch)
	m, err := New(sessionPath(t), testBank, 0, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if got := m.Snapshot().ElapsedSeconds; got != 0 {
		t.Errorf("idle ElapsedSeconds = %d, want 0", got)
	}

	if _, err := m.Start(ModeTraining, 0); err != nil {
		t.Fatalf("Start: %v", err)
	}
	setNow(epoch.Add(25 * time.Minute))
	snap := m.Snapshot()
	if !snap.Untimed {
		t.Fatal("Untimed = false, want true for a training attempt")
	}
	if snap.DurationSeconds != 0 || snap.RemainingSeconds != 0 {
		t.Fatalf("duration/remaining = %d/%d, want 0/0 — the premise of this test",
			snap.DurationSeconds, snap.RemainingSeconds)
	}
	if snap.ElapsedSeconds != 1500 {
		t.Errorf("running ElapsedSeconds = %d, want 1500", snap.ElapsedSeconds)
	}

	// Once ended it freezes at the length of the attempt, rather than
	// counting on for as long as the score page is left open.
	if err := m.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}
	setNow(epoch.Add(3 * time.Hour))
	if got := m.Snapshot().ElapsedSeconds; got != 1500 {
		t.Errorf("ended ElapsedSeconds = %d, want it frozen at 1500", got)
	}
}

// The draw's parameters ride with the attempt: persisted at Start,
// reported on every snapshot, and still there after a restart — which is
// what lets grading refuse when the pool has moved on.
func TestStartDrawPersistsSeedAndDigest(t *testing.T) {
	path := sessionPath(t)
	clock, _ := fakeClock(epoch)
	m, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	draw := Draw{
		QuestionIDs:  []string{"q02", "q01"},
		Seed:         "a1b2c3",
		PoolDigest:   "0123456789ab",
		DomainFilter: []string{"Workloads"},
	}
	if _, err := m.StartDraw(ModeExam, testDur, draw); err != nil {
		t.Fatalf("StartDraw: %v", err)
	}

	check := func(label string, snap Snapshot) {
		t.Helper()
		if snap.Seed != "a1b2c3" {
			t.Errorf("%s Seed = %q, want a1b2c3", label, snap.Seed)
		}
		if snap.PoolDigest != "0123456789ab" {
			t.Errorf("%s PoolDigest = %q, want 0123456789ab", label, snap.PoolDigest)
		}
		if len(snap.DomainFilter) != 1 || snap.DomainFilter[0] != "Workloads" {
			t.Errorf("%s DomainFilter = %v, want [Workloads]", label, snap.DomainFilter)
		}
	}
	check("live", m.Snapshot())

	m2, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New (reload): %v", err)
	}
	check("reloaded", m2.Snapshot())
	if got := m2.QuestionIDs(); len(got) != 2 || got[0] != "q02" {
		t.Errorf("reloaded QuestionIDs = %v, want [q02 q01]", got)
	}

	// And Reset clears every part of it, so the next attempt draws fresh.
	if err := m2.Reset(); err != nil {
		t.Fatalf("Reset: %v", err)
	}
	snap := m2.Snapshot()
	if snap.Seed != "" || snap.PoolDigest != "" || snap.DomainFilter != nil {
		t.Errorf("after Reset: seed=%q digest=%q filter=%v, want all empty",
			snap.Seed, snap.PoolDigest, snap.DomainFilter)
	}
}
