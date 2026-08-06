package session

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

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
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	snap, err := m.Start(ModeExam, testDur)
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
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(ModeExam, testDur); err != nil {
		t.Fatalf("first Start: %v", err)
	}
	if _, err := m.Start(ModeExam, testDur); !errors.Is(err, ErrConflict) {
		t.Errorf("second Start error = %v, want ErrConflict", err)
	}
}

func TestSnapshotRemainingDecreasesWithClock(t *testing.T) {
	clock, set := fakeClock(epoch)
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(ModeExam, testDur); err != nil {
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
	m, err := New(sessionPath(t), testBank, testDur, clock, func() { fired++ })
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(ModeExam, testDur); err != nil {
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
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(ModeExam, testDur); err != nil {
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
				if _, err := m.Start(ModeExam, testDur); err != nil {
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
				if _, err := m.Start(ModeExam, testDur); err != nil {
					t.Fatalf("Start: %v", err)
				}
				if err := m.End("submitted"); err != nil {
					t.Fatalf("End: %v", err)
				}
				if err := m.SetResults(m.AttemptToken(), json.RawMessage(`{"earned":1}`)); err != nil {
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
			m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
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
			if _, err := m.Start(ModeExam, testDur); err != nil {
				t.Fatalf("Start: %v", err)
			}
		}},
		{name: "ended without results", setup: func(t *testing.T, m *Manager) {
			t.Helper()
			if _, err := m.Start(ModeExam, testDur); err != nil {
				t.Fatalf("Start: %v", err)
			}
			if err := m.End("submitted"); err != nil {
				t.Fatalf("End: %v", err)
			}
		}},
		{name: "ended with results", setup: func(t *testing.T, m *Manager) {
			t.Helper()
			if _, err := m.Start(ModeExam, testDur); err != nil {
				t.Fatalf("Start: %v", err)
			}
			if err := m.End("submitted"); err != nil {
				t.Fatalf("End: %v", err)
			}
			if err := m.SetResults(m.AttemptToken(), json.RawMessage(`{"earned":1}`)); err != nil {
				t.Fatalf("SetResults: %v", err)
			}
		}},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			clock, _ := fakeClock(epoch)
			m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
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

	m1, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New (m1): %v", err)
	}
	if _, err := m1.Start(ModeExam, testDur); err != nil {
		t.Fatalf("Start: %v", err)
	}

	m2, err := New(path, testBank, testDur, clock, func() {})
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

	m1, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New (m1): %v", err)
	}
	if _, err := m1.Start(ModeExam, testDur); err != nil {
		t.Fatalf("Start: %v", err)
	}

	set(epoch.Add(testDur + time.Minute))

	fired := 0
	m2, err := New(path, testBank, testDur, clock, func() { fired++ })
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

	if fired != 0 {
		t.Errorf("onExpire fired %d times from New, want 0", fired)
	}

	m3, err := New(path, testBank, testDur, clock, func() {})
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
	m, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New with corrupt file: %v", err)
	}
	snap := m.Snapshot()
	if snap.State != "idle" {
		t.Errorf("State = %q, want idle", snap.State)
	}
}

func TestNewMissingFileStartsIdle(t *testing.T) {
	path := sessionPath(t)
	clock, _ := fakeClock(epoch)
	m, err := New(path, testBank, testDur, clock, func() {})
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
	m, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(ModeExam, testDur); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := m.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}

	want := json.RawMessage(`{"earned":5,"total":17}`)
	if err := m.SetResults(m.AttemptToken(), want); err != nil {
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

	m2, err := New(path, testBank, testDur, clock, func() {})
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
	m, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(ModeExam, testDur); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := m.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}

	if err := m.SetGradeError(m.AttemptToken(), "ssh: connection refused"); err != nil {
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

	m2, err := New(path, testBank, testDur, clock, func() {})
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

func TestSetResultsAndGradeErrorRejectedUnlessEnded(t *testing.T) {
	cases := []struct {
		name  string
		setup func(t *testing.T, m *Manager)
	}{
		{
			name:  "idle (never started)",
			setup: func(t *testing.T, m *Manager) {},
		},
		{
			name: "reset after end (late grade vs. Reset)",
			setup: func(t *testing.T, m *Manager) {
				t.Helper()
				if _, err := m.Start(ModeExam, testDur); err != nil {
					t.Fatalf("Start: %v", err)
				}
				if err := m.End("submitted"); err != nil {
					t.Fatalf("End: %v", err)
				}
				if err := m.Reset(); err != nil {
					t.Fatalf("Reset: %v", err)
				}
			},
		},
		{
			name: "reset+start after end (late grade vs. Reset+Start of new attempt)",
			setup: func(t *testing.T, m *Manager) {
				t.Helper()
				if _, err := m.Start(ModeExam, testDur); err != nil {
					t.Fatalf("Start: %v", err)
				}
				if err := m.End("submitted"); err != nil {
					t.Fatalf("End: %v", err)
				}
				if err := m.Reset(); err != nil {
					t.Fatalf("Reset: %v", err)
				}
				if _, err := m.Start(ModeExam, testDur); err != nil {
					t.Fatalf("Start (new attempt): %v", err)
				}
			},
		},
		{
			name: "running (grade arriving before End at all)",
			setup: func(t *testing.T, m *Manager) {
				t.Helper()
				if _, err := m.Start(ModeExam, testDur); err != nil {
					t.Fatalf("Start: %v", err)
				}
			},
		},
	}

	for _, c := range cases {
		t.Run(c.name+"/SetResults", func(t *testing.T) {
			path := sessionPath(t)
			clock, _ := fakeClock(epoch)
			m, err := New(path, testBank, testDur, clock, func() {})
			if err != nil {
				t.Fatalf("New: %v", err)
			}
			c.setup(t, m)
			beforeResults, beforeGradeErr, beforeGraded := m.Results()

			stale := json.RawMessage(`{"earned":999,"total":999}`)
			if err := m.SetResults(m.AttemptToken(), stale); !errors.Is(err, ErrConflict) {
				t.Fatalf("SetResults error = %v, want ErrConflict", err)
			}

			results, gradeErr, graded := m.Results()
			if string(results) != string(beforeResults) || gradeErr != beforeGradeErr || graded != beforeGraded {
				t.Errorf("Results() after rejected SetResults = (%s, %q, %v), want unchanged (%s, %q, %v)",
					results, gradeErr, graded, beforeResults, beforeGradeErr, beforeGraded)
			}

			m2, err := New(path, testBank, testDur, clock, func() {})
			if err != nil {
				t.Fatalf("New (reload): %v", err)
			}
			reloadedResults, reloadedGradeErr, reloadedGraded := m2.Results()
			if string(reloadedResults) != string(beforeResults) || reloadedGradeErr != beforeGradeErr || reloadedGraded != beforeGraded {
				t.Errorf("reloaded Results() = (%s, %q, %v), want unchanged (%s, %q, %v)",
					reloadedResults, reloadedGradeErr, reloadedGraded, beforeResults, beforeGradeErr, beforeGraded)
			}
		})

		t.Run(c.name+"/SetGradeError", func(t *testing.T) {
			path := sessionPath(t)
			clock, _ := fakeClock(epoch)
			m, err := New(path, testBank, testDur, clock, func() {})
			if err != nil {
				t.Fatalf("New: %v", err)
			}
			c.setup(t, m)
			beforeResults, beforeGradeErr, beforeGraded := m.Results()

			if err := m.SetGradeError(m.AttemptToken(), "ssh: connection refused (stale)"); !errors.Is(err, ErrConflict) {
				t.Fatalf("SetGradeError error = %v, want ErrConflict", err)
			}

			results, gradeErr, graded := m.Results()
			if string(results) != string(beforeResults) || gradeErr != beforeGradeErr || graded != beforeGraded {
				t.Errorf("Results() after rejected SetGradeError = (%s, %q, %v), want unchanged (%s, %q, %v)",
					results, gradeErr, graded, beforeResults, beforeGradeErr, beforeGraded)
			}

			m2, err := New(path, testBank, testDur, clock, func() {})
			if err != nil {
				t.Fatalf("New (reload): %v", err)
			}
			reloadedResults, reloadedGradeErr, reloadedGraded := m2.Results()
			if string(reloadedResults) != string(beforeResults) || reloadedGradeErr != beforeGradeErr || reloadedGraded != beforeGraded {
				t.Errorf("reloaded Results() = (%s, %q, %v), want unchanged (%s, %q, %v)",
					reloadedResults, reloadedGradeErr, reloadedGraded, beforeResults, beforeGradeErr, beforeGraded)
			}
		})
	}
}

func TestReloadEndedWithoutResultsAllowsRegrade(t *testing.T) {
	path := sessionPath(t)
	clock, _ := fakeClock(epoch)

	m1, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New (m1): %v", err)
	}
	if _, err := m1.Start(ModeExam, testDur); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := m1.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}

	m2, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New (m2, reload): %v", err)
	}

	results, gradeErr, graded := m2.Results()
	if graded {
		t.Errorf("reloaded Results() graded = true, want false (results=%v gradeErr=%q)", results, gradeErr)
	}
	if results != nil {
		t.Errorf("reloaded Results() results = %v (%q), want nil", results, string(results))
	}

	if err := m2.End("submitted"); err != nil {
		t.Errorf("End on reloaded ended-without-results session: got %v, want nil (regrade should be allowed)", err)
	}
}

func TestResultsNotGradedBeforeSet(t *testing.T) {
	clock, _ := fakeClock(epoch)
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(ModeExam, testDur); err != nil {
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

func TestStartPersistFailureRollsBack(t *testing.T) {
	path := filepath.Join(t.TempDir(), "missing-subdir", "session.json")
	clock, _ := fakeClock(epoch)
	m, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	if _, err := m.Start(ModeExam, testDur); err == nil {
		t.Fatal("Start with unwritable session dir: got nil error, want non-nil")
	}

	snap := m.Snapshot()
	if snap.State != "idle" {
		t.Errorf("State after failed Start = %q, want idle (rolled back)", snap.State)
	}
}

func TestEndPersistFailureRollsBack(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "session.json")
	clock, _ := fakeClock(epoch)
	m, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(ModeExam, testDur); err != nil {
		t.Fatalf("Start: %v", err)
	}

	if err := os.RemoveAll(dir); err != nil {
		t.Fatalf("RemoveAll: %v", err)
	}

	if err := m.End("submitted"); err == nil {
		t.Fatal("End with removed session dir: got nil error, want non-nil")
	}

	snap := m.Snapshot()
	if snap.State != "running" {
		t.Errorf("State after failed End = %q, want running (rolled back)", snap.State)
	}
	if snap.EndReason != "" {
		t.Errorf("EndReason after failed End = %q, want empty (rolled back)", snap.EndReason)
	}
}

func TestRealTimerFiresOnExpiry(t *testing.T) {
	firedCh := make(chan struct{}, 1)
	m, err := New(sessionPath(t), testBank, 50*time.Millisecond, time.Now, func() {
		firedCh <- struct{}{}
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	if _, err := m.Start(ModeExam, 50*time.Millisecond); err != nil {
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

func TestTrainingAttemptIsUntimedAndNeverExpires(t *testing.T) {
	clock, setNow := fakeClock(epoch)
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	snap, err := m.Start(ModeTraining, 0)
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if !snap.Untimed {
		t.Error("Untimed = false, want true for a training attempt")
	}
	if snap.Mode != ModeTraining {
		t.Errorf("Mode = %q, want %q", snap.Mode, ModeTraining)
	}
	if snap.RemainingSeconds != 0 {
		t.Errorf("RemainingSeconds = %d, want 0 (meaningless when untimed)", snap.RemainingSeconds)
	}

	setNow(clock().Add(365 * 24 * time.Hour))
	if got := m.Snapshot(); got.State != "running" {
		t.Errorf("State = %q after a year, want still running", got.State)
	}
}

func TestSpeedAttemptUsesTheDurationItWasGiven(t *testing.T) {
	clock, setNow := fakeClock(epoch)
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	snap, err := m.Start(ModeSpeed, time.Hour)
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if snap.DurationSeconds != 3600 {
		t.Errorf("DurationSeconds = %d, want 3600 — the attempt's clock, not the manager default", snap.DurationSeconds)
	}

	setNow(clock().Add(61 * time.Minute))
	if got := m.Snapshot(); got.State != "ended" || got.EndReason != "expired" {
		t.Errorf("got state=%q reason=%q, want ended/expired", got.State, got.EndReason)
	}
}

func TestStartRejectsAnUnknownMode(t *testing.T) {
	clock, _ := fakeClock(epoch)
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start("sudden-death", testDur); err == nil {
		t.Fatal("Start accepted an unknown mode; it must not silently behave like an exam")
	}
	if got := m.Snapshot(); got.State != "idle" {
		t.Errorf("State = %q, want the session left idle", got.State)
	}
}

func TestResumeKeepsTheAttemptsOwnClockAndMode(t *testing.T) {
	path := sessionPath(t)
	clock, _ := fakeClock(epoch)

	m1, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m1.Start(ModeTraining, 0); err != nil {
		t.Fatalf("Start: %v", err)
	}

	m2, err := New(path, testBank, 30*time.Minute, clock, func() {})
	if err != nil {
		t.Fatalf("New (resume): %v", err)
	}
	snap := m2.Snapshot()
	if snap.State != "running" {
		t.Fatalf("State = %q, want running", snap.State)
	}
	if !snap.Untimed || snap.Mode != ModeTraining {
		t.Errorf("resumed as mode=%q untimed=%v, want training/untimed", snap.Mode, snap.Untimed)
	}
}
