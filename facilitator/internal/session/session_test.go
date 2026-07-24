package session

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// fakeClock returns a clock func() time.Time backed by a mutable variable,
// plus a setter to move it forward — the "no time.Sleep" fake clock the
// brief requires for every test except the dedicated real-timer test.
func fakeClock(start time.Time) (clock func() time.Time, set func(time.Time)) {
	now := start
	return func() time.Time { return now }, func(t time.Time) { now = t }
}

func sessionPath(t *testing.T) string {
	t.Helper()
	return filepath.Join(t.TempDir(), "session.json")
}

const testDur = 2 * time.Hour

var epoch = time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

func TestStartIdleToRunning(t *testing.T) {
	clock, _ := fakeClock(epoch)
	m, err := New(sessionPath(t), testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	snap, err := m.Start()
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if snap.State != "running" {
		t.Errorf("State = %q, want running", snap.State)
	}
	if !snap.StartedAt.Equal(epoch) {
		t.Errorf("StartedAt = %v, want %v", snap.StartedAt, epoch)
	}
	if snap.DurationSeconds != int(testDur.Seconds()) {
		t.Errorf("DurationSeconds = %d, want %d", snap.DurationSeconds, int(testDur.Seconds()))
	}
	if snap.RemainingSeconds != int(testDur.Seconds()) {
		t.Errorf("RemainingSeconds = %d, want %d", snap.RemainingSeconds, int(testDur.Seconds()))
	}
	if snap.EndReason != "" {
		t.Errorf("EndReason = %q, want empty", snap.EndReason)
	}
}

func TestStartTwiceConflict(t *testing.T) {
	clock, _ := fakeClock(epoch)
	m, err := New(sessionPath(t), testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(); err != nil {
		t.Fatalf("first Start: %v", err)
	}
	if _, err := m.Start(); !errors.Is(err, ErrConflict) {
		t.Errorf("second Start error = %v, want ErrConflict", err)
	}
}

func TestSnapshotRemainingDecreasesWithClock(t *testing.T) {
	clock, set := fakeClock(epoch)
	m, err := New(sessionPath(t), testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}

	set(epoch.Add(90 * time.Minute))
	snap := m.Snapshot()
	wantRemaining := int((30 * time.Minute).Seconds())
	if snap.RemainingSeconds != wantRemaining {
		t.Errorf("RemainingSeconds = %d, want %d", snap.RemainingSeconds, wantRemaining)
	}
	if snap.State != "running" {
		t.Errorf("State = %q, want running (not yet expired)", snap.State)
	}
}

func TestSnapshotLazyExpiryFiresOnExpireOnce(t *testing.T) {
	clock, set := fakeClock(epoch)
	fired := 0
	m, err := New(sessionPath(t), testDur, clock, func() { fired++ })
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}

	set(epoch.Add(testDur + time.Second))
	snap := m.Snapshot()
	if snap.State != "ended" {
		t.Errorf("State = %q, want ended", snap.State)
	}
	if snap.EndReason != "expired" {
		t.Errorf("EndReason = %q, want expired", snap.EndReason)
	}
	if snap.RemainingSeconds != 0 {
		t.Errorf("RemainingSeconds = %d, want 0", snap.RemainingSeconds)
	}
	if fired != 1 {
		t.Fatalf("onExpire fired %d times, want 1", fired)
	}

	// A second Snapshot after the same expiry must not re-fire onExpire.
	snap2 := m.Snapshot()
	if snap2.State != "ended" {
		t.Errorf("second Snapshot State = %q, want ended", snap2.State)
	}
	if fired != 1 {
		t.Errorf("onExpire fired %d times after second Snapshot, want still 1", fired)
	}
}

func TestEndSubmittedFromRunning(t *testing.T) {
	clock, _ := fakeClock(epoch)
	m, err := New(sessionPath(t), testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := m.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}
	snap := m.Snapshot()
	if snap.State != "ended" {
		t.Errorf("State = %q, want ended", snap.State)
	}
	if snap.EndReason != "submitted" {
		t.Errorf("EndReason = %q, want submitted", snap.EndReason)
	}
}

func TestEndConflicts(t *testing.T) {
	cases := []struct {
		name        string
		setup       func(t *testing.T, m *Manager)
		wantErr     bool
		wantConfErr bool
	}{
		{
			name:        "idle",
			setup:       func(t *testing.T, m *Manager) {},
			wantErr:     true,
			wantConfErr: true,
		},
		{
			name: "ended without results",
			setup: func(t *testing.T, m *Manager) {
				t.Helper()
				if _, err := m.Start(); err != nil {
					t.Fatalf("Start: %v", err)
				}
				if err := m.End("submitted"); err != nil {
					t.Fatalf("End: %v", err)
				}
			},
			wantErr: false,
		},
		{
			name: "ended with results",
			setup: func(t *testing.T, m *Manager) {
				t.Helper()
				if _, err := m.Start(); err != nil {
					t.Fatalf("Start: %v", err)
				}
				if err := m.End("submitted"); err != nil {
					t.Fatalf("End: %v", err)
				}
				if err := m.SetResults(json.RawMessage(`{"earned":1}`)); err != nil {
					t.Fatalf("SetResults: %v", err)
				}
			},
			wantErr:     true,
			wantConfErr: true,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			clock, _ := fakeClock(epoch)
			m, err := New(sessionPath(t), testDur, clock, func() {})
			if err != nil {
				t.Fatalf("New: %v", err)
			}
			c.setup(t, m)

			err = m.End("submitted")
			if c.wantErr && err == nil {
				t.Fatal("End: got nil error, want non-nil")
			}
			if !c.wantErr && err != nil {
				t.Fatalf("End: got %v, want nil", err)
			}
			if c.wantConfErr && !errors.Is(err, ErrConflict) {
				t.Errorf("End error = %v, want ErrConflict", err)
			}
		})
	}
}

func TestResetFromEveryState(t *testing.T) {
	cases := []struct {
		name  string
		setup func(t *testing.T, m *Manager)
	}{
		{name: "idle", setup: func(t *testing.T, m *Manager) {}},
		{name: "running", setup: func(t *testing.T, m *Manager) {
			t.Helper()
			if _, err := m.Start(); err != nil {
				t.Fatalf("Start: %v", err)
			}
		}},
		{name: "ended without results", setup: func(t *testing.T, m *Manager) {
			t.Helper()
			if _, err := m.Start(); err != nil {
				t.Fatalf("Start: %v", err)
			}
			if err := m.End("submitted"); err != nil {
				t.Fatalf("End: %v", err)
			}
		}},
		{name: "ended with results", setup: func(t *testing.T, m *Manager) {
			t.Helper()
			if _, err := m.Start(); err != nil {
				t.Fatalf("Start: %v", err)
			}
			if err := m.End("submitted"); err != nil {
				t.Fatalf("End: %v", err)
			}
			if err := m.SetResults(json.RawMessage(`{"earned":1}`)); err != nil {
				t.Fatalf("SetResults: %v", err)
			}
		}},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			clock, _ := fakeClock(epoch)
			m, err := New(sessionPath(t), testDur, clock, func() {})
			if err != nil {
				t.Fatalf("New: %v", err)
			}
			c.setup(t, m)

			if err := m.Reset(); err != nil {
				t.Fatalf("Reset: %v", err)
			}
			snap := m.Snapshot()
			if snap.State != "idle" {
				t.Errorf("State = %q, want idle", snap.State)
			}
			if !snap.StartedAt.IsZero() {
				t.Errorf("StartedAt = %v, want zero", snap.StartedAt)
			}
			if snap.EndReason != "" {
				t.Errorf("EndReason = %q, want empty", snap.EndReason)
			}
			if snap.RemainingSeconds != 0 {
				t.Errorf("RemainingSeconds = %d, want 0", snap.RemainingSeconds)
			}
			results, gradeErr, graded := m.Results()
			if results != nil || gradeErr != "" || graded {
				t.Errorf("Results() = (%v, %q, %v), want (nil, \"\", false)", results, gradeErr, graded)
			}
		})
	}
}

func TestPersistenceRoundTrip(t *testing.T) {
	path := sessionPath(t)
	clock, _ := fakeClock(epoch)

	m1, err := New(path, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New (m1): %v", err)
	}
	if _, err := m1.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}

	m2, err := New(path, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New (m2): %v", err)
	}
	snap := m2.Snapshot()
	if snap.State != "running" {
		t.Errorf("reloaded State = %q, want running", snap.State)
	}
	if !snap.StartedAt.Equal(epoch) {
		t.Errorf("reloaded StartedAt = %v, want %v", snap.StartedAt, epoch)
	}
	if snap.RemainingSeconds != int(testDur.Seconds()) {
		t.Errorf("reloaded RemainingSeconds = %d, want %d", snap.RemainingSeconds, int(testDur.Seconds()))
	}
}

func TestReloadRunningPastExpiryEndsImmediately(t *testing.T) {
	path := sessionPath(t)
	clock, set := fakeClock(epoch)

	m1, err := New(path, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New (m1): %v", err)
	}
	if _, err := m1.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}

	set(epoch.Add(testDur + time.Minute))

	fired := 0
	m2, err := New(path, testDur, clock, func() { fired++ })
	if err != nil {
		t.Fatalf("New (m2): %v", err)
	}
	snap := m2.Snapshot()
	if snap.State != "ended" {
		t.Errorf("reloaded State = %q, want ended", snap.State)
	}
	if snap.EndReason != "expired" {
		t.Errorf("reloaded EndReason = %q, want expired", snap.EndReason)
	}
	// New's load-time correction is not a live expiry the timer/Snapshot
	// observed happening — it's fixing up stale state from a prior
	// process's lifetime. onExpire (used to kick grading) intentionally
	// does not fire here; see New's doc comment.
	if fired != 0 {
		t.Errorf("onExpire fired %d times from New, want 0", fired)
	}

	// The immediate end-on-load must itself be persisted (Persist BEFORE
	// returning applies here too), independent of any later Snapshot call.
	m3, err := New(path, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New (m3): %v", err)
	}
	snap3 := m3.Snapshot()
	if snap3.State != "ended" || snap3.EndReason != "expired" {
		t.Errorf("m3 snapshot = %+v, want ended/expired (persisted by m2's New)", snap3)
	}
}

func TestCorruptFileStartsIdle(t *testing.T) {
	path := sessionPath(t)
	if err := os.WriteFile(path, []byte("{not valid json"), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	clock, _ := fakeClock(epoch)
	m, err := New(path, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New with corrupt file: %v", err)
	}
	snap := m.Snapshot()
	if snap.State != "idle" {
		t.Errorf("State = %q, want idle", snap.State)
	}
}

func TestNewMissingFileStartsIdle(t *testing.T) {
	path := sessionPath(t) // never written
	clock, _ := fakeClock(epoch)
	m, err := New(path, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New with missing file: %v", err)
	}
	snap := m.Snapshot()
	if snap.State != "idle" {
		t.Errorf("State = %q, want idle", snap.State)
	}
}

func TestSetResultsPersists(t *testing.T) {
	path := sessionPath(t)
	clock, _ := fakeClock(epoch)
	m, err := New(path, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := m.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}

	want := json.RawMessage(`{"earned":5,"total":17}`)
	if err := m.SetResults(want); err != nil {
		t.Fatalf("SetResults: %v", err)
	}

	results, gradeErr, graded := m.Results()
	if string(results) != string(want) {
		t.Errorf("Results() results = %s, want %s", results, want)
	}
	if gradeErr != "" {
		t.Errorf("Results() gradeErr = %q, want empty", gradeErr)
	}
	if !graded {
		t.Errorf("Results() graded = false, want true")
	}

	// Reload from disk on a fresh Manager to prove it was persisted.
	m2, err := New(path, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New (reload): %v", err)
	}
	results2, _, graded2 := m2.Results()
	if string(results2) != string(want) {
		t.Errorf("reloaded results = %s, want %s", results2, want)
	}
	if !graded2 {
		t.Errorf("reloaded graded = false, want true")
	}
}

func TestSetGradeErrorPersists(t *testing.T) {
	path := sessionPath(t)
	clock, _ := fakeClock(epoch)
	m, err := New(path, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := m.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}

	if err := m.SetGradeError("ssh: connection refused"); err != nil {
		t.Fatalf("SetGradeError: %v", err)
	}

	results, gradeErr, graded := m.Results()
	if results != nil {
		t.Errorf("Results() results = %v, want nil", results)
	}
	if gradeErr != "ssh: connection refused" {
		t.Errorf("Results() gradeErr = %q, want %q", gradeErr, "ssh: connection refused")
	}
	if !graded {
		t.Errorf("Results() graded = false, want true (gradeError counts as a terminal grading outcome)")
	}

	m2, err := New(path, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New (reload): %v", err)
	}
	_, gradeErr2, graded2 := m2.Results()
	if gradeErr2 != "ssh: connection refused" {
		t.Errorf("reloaded gradeErr = %q, want %q", gradeErr2, "ssh: connection refused")
	}
	if !graded2 {
		t.Errorf("reloaded graded = false, want true")
	}
}

func TestResultsNotGradedBeforeSet(t *testing.T) {
	clock, _ := fakeClock(epoch)
	m, err := New(sessionPath(t), testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := m.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}
	results, gradeErr, graded := m.Results()
	if results != nil || gradeErr != "" || graded {
		t.Errorf("Results() = (%v, %q, %v), want (nil, \"\", false) before grading completes", results, gradeErr, graded)
	}
}

// TestRealTimerFiresOnExpiry is the one test allowed a real timer wait: it
// uses the real clock and a short real duration to prove the time.Timer
// mechanism itself (not just the lazy Snapshot check) auto-ends a session
// with no requests in flight. A generous buffered-channel wait replaces
// time.Sleep-based assertions.
func TestRealTimerFiresOnExpiry(t *testing.T) {
	firedCh := make(chan struct{}, 1)
	m, err := New(sessionPath(t), 50*time.Millisecond, time.Now, func() {
		firedCh <- struct{}{}
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}

	select {
	case <-firedCh:
	case <-time.After(5 * time.Second):
		t.Fatal("onExpire did not fire within 5s of a 50ms session timer")
	}

	snap := m.Snapshot()
	if snap.State != "ended" {
		t.Errorf("State = %q, want ended", snap.State)
	}
	if snap.EndReason != "expired" {
		t.Errorf("EndReason = %q, want expired", snap.EndReason)
	}
}
