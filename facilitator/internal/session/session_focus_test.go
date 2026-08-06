package session

import (
	"errors"
	"testing"
	"time"
)

func TestFocusAccruesToThePreviousQuestion(t *testing.T) {
	clock, setNow := fakeClock(epoch)
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(ModeExam, testDur); err != nil {
		t.Fatalf("Start: %v", err)
	}

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

	if got["q01"] != 50 {
		t.Errorf("q01 = %ds, want 50s", got["q01"])
	}
	if got["q02"] != 15 {
		t.Errorf("q02 = %ds, want 15s", got["q02"])
	}
}

func TestFocusCapsALongGap(t *testing.T) {
	clock, setNow := fakeClock(epoch)
	m, err := New(sessionPath(t), testBank, 0, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

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

	setNow(epoch.Add(time.Hour + 10*time.Second))
	if err := m2.Focus("q02"); err != nil {
		t.Fatalf("Focus after reload: %v", err)
	}
	if _, billed := m2.TimeSpent()["q02"]; billed {
		t.Error("the first report after a reload billed the downtime")
	}
}

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

	if err := m.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}
	setNow(epoch.Add(3 * time.Hour))
	if got := m.Snapshot().ElapsedSeconds; got != 1500 {
		t.Errorf("ended ElapsedSeconds = %d, want it frozen at 1500", got)
	}
}

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

	if err := m2.Reset(); err != nil {
		t.Fatalf("Reset: %v", err)
	}
	snap := m2.Snapshot()
	if snap.Seed != "" || snap.PoolDigest != "" || snap.DomainFilter != nil {
		t.Errorf("after Reset: seed=%q digest=%q filter=%v, want all empty",
			snap.Seed, snap.PoolDigest, snap.DomainFilter)
	}
}
