package job

import (
	"errors"
	"testing"
	"time"
)

func testPhases() []PhaseSpec {
	return []PhaseSpec{
		{ID: "end-session", Label: "End session"},
		{ID: "wipe-instances", Label: "Wipe instance state"},
		{ID: "verify", Label: "Verify"},
	}
}

func fixedClock() func() time.Time {
	t0 := time.Date(2026, 7, 24, 12, 0, 0, 0, time.UTC)
	return func() time.Time { return t0 }
}

func TestBeginRejectsSecondJobWhileBusy(t *testing.T) {
	s := NewStore(fixedClock())
	if _, err := s.Begin("reset", "", testPhases()); err != nil {
		t.Fatalf("Begin: %v", err)
	}
	if _, err := s.Begin("reset", "", testPhases()); !errors.Is(err, ErrBusy) {
		t.Fatalf("second Begin = %v, want ErrBusy", err)
	}
}

func TestJobLifecyclePhasesAndCompletion(t *testing.T) {
	s := NewStore(fixedClock())
	j, err := s.Begin("switch", "cka-mock-01", testPhases())
	if err != nil {
		t.Fatalf("Begin: %v", err)
	}
	if j.Op != "switch" || j.Bank != "cka-mock-01" {
		t.Fatalf("job identity = %s/%s", j.Op, j.Bank)
	}

	s.StartPhase(j.ID, "end-session")
	snap := s.Status()
	if !snap.Busy || snap.Job == nil {
		t.Fatal("Status should report a busy in-flight job")
	}
	if snap.Job.Phase != "end-session" {
		t.Fatalf("current phase = %q, want end-session", snap.Job.Phase)
	}
	if got := phaseState(t, snap.Job, "end-session"); got != PhaseRunning {
		t.Fatalf("end-session state = %q, want running", got)
	}
	if got := phaseState(t, snap.Job, "wipe-instances"); got != PhasePending {
		t.Fatalf("wipe-instances state = %q, want pending", got)
	}

	s.StartPhase(j.ID, "wipe-instances")
	snap = s.Status()
	if got := phaseState(t, snap.Job, "end-session"); got != PhaseDone {
		t.Fatalf("end-session after advance = %q, want done", got)
	}

	s.Complete(j.ID)
	snap = s.Status()
	if snap.Busy || snap.Job != nil {
		t.Fatal("Status should be idle after Complete")
	}
	if snap.LastJob == nil || snap.LastJob.Error != "" {
		t.Fatalf("LastJob = %+v, want completed without error", snap.LastJob)
	}
	// every phase of a completed job reads done
	for _, p := range snap.LastJob.Phases {
		if p.State != PhaseDone {
			t.Fatalf("phase %s state = %q, want done", p.ID, p.State)
		}
	}

	// a new job may begin after completion
	if _, err := s.Begin("reset", "", testPhases()); err != nil {
		t.Fatalf("Begin after Complete: %v", err)
	}
}

func TestFailMarksCurrentPhaseAndRecordsError(t *testing.T) {
	s := NewStore(fixedClock())
	j, _ := s.Begin("reset", "", testPhases())
	s.StartPhase(j.ID, "end-session")
	s.StartPhase(j.ID, "wipe-instances")
	s.Fail(j.ID, "exec exited 1: find: permission denied")

	snap := s.Status()
	if snap.Busy {
		t.Fatal("failed job should not stay busy")
	}
	if snap.LastJob == nil || snap.LastJob.Error == "" {
		t.Fatal("failed job must surface its error")
	}
	if got := phaseState(t, snap.LastJob, "wipe-instances"); got != PhaseFailed {
		t.Fatalf("failing phase state = %q, want failed", got)
	}
	if got := phaseState(t, snap.LastJob, "verify"); got != PhasePending {
		t.Fatalf("unreached phase state = %q, want pending", got)
	}

	// the store accepts a fresh job after a failure
	if _, err := s.Begin("reset", "", testPhases()); err != nil {
		t.Fatalf("Begin after Fail: %v", err)
	}
}

func TestStaleJobIDsAreIgnored(t *testing.T) {
	s := NewStore(fixedClock())
	j1, _ := s.Begin("reset", "", testPhases())
	s.Complete(j1.ID)
	j2, _ := s.Begin("reset", "", testPhases())
	s.StartPhase(j2.ID, "end-session")

	// calls referencing the finished job must not disturb the live one
	s.StartPhase(j1.ID, "verify")
	s.Fail(j1.ID, "stale")
	snap := s.Status()
	if !snap.Busy || snap.Job == nil || snap.Job.ID != j2.ID {
		t.Fatal("stale-job calls must not affect the current job")
	}
	if snap.Job.Phase != "end-session" {
		t.Fatalf("current phase = %q, want end-session", snap.Job.Phase)
	}
}

func phaseState(t *testing.T, j *Job, id string) PhaseState {
	t.Helper()
	for _, p := range j.Phases {
		if p.ID == id {
			return p.State
		}
	}
	t.Fatalf("phase %s not found in %+v", id, j.Phases)
	return ""
}
