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

// stepClock advances one second per call, so timing assertions can tell
// "stamped" from "not stamped" and one phase's stamps from the next's.
func stepClock() func() time.Time {
	t0 := time.Date(2026, 7, 24, 12, 0, 0, 0, time.UTC)
	n := 0
	return func() time.Time {
		t := t0.Add(time.Duration(n) * time.Second)
		n++
		return t
	}
}

func TestPhasesRecordStartAndFinishTimes(t *testing.T) {
	s := NewStore(stepClock())
	j, _ := s.Begin("reset", "", testPhases())

	s.StartPhase(j.ID, "end-session")
	s.StartPhase(j.ID, "wipe-instances")
	snap := s.Status()

	first := phase(t, snap.Job, "end-session")
	if first.StartedAt == "" {
		t.Error("a started phase must record startedAt")
	}
	if first.FinishedAt == "" {
		t.Error("a phase closed by the next StartPhase must record finishedAt")
	}
	second := phase(t, snap.Job, "wipe-instances")
	if second.StartedAt == "" {
		t.Error("the newly running phase must record startedAt")
	}
	if second.FinishedAt != "" {
		t.Errorf("a running phase must not record finishedAt, got %q", second.FinishedAt)
	}
	if pending := phase(t, snap.Job, "verify"); pending.StartedAt != "" {
		t.Errorf("an unreached phase must not record startedAt, got %q", pending.StartedAt)
	}

	// Stamps must be parseable and ordered — the UI subtracts them.
	startedAt := mustParse(t, second.StartedAt)
	if firstFinished := mustParse(t, first.FinishedAt); startedAt.Before(firstFinished) {
		t.Errorf("phase 2 started %v before phase 1 finished %v", startedAt, firstFinished)
	}
}

func TestCompleteStampsJobAndRemainingPhases(t *testing.T) {
	s := NewStore(stepClock())
	j, _ := s.Begin("reset", "", testPhases())
	s.StartPhase(j.ID, "end-session")
	s.Complete(j.ID)

	snap := s.Status()
	if snap.LastJob.FinishedAt == "" {
		t.Error("a completed job must record finishedAt")
	}
	for _, p := range snap.LastJob.Phases {
		if p.FinishedAt == "" {
			t.Errorf("phase %s of a completed job must record finishedAt", p.ID)
		}
	}
}

func TestFailStampsFailingPhaseAndJobButNotUnreachedPhases(t *testing.T) {
	s := NewStore(stepClock())
	j, _ := s.Begin("reset", "", testPhases())
	s.StartPhase(j.ID, "end-session")
	s.Fail(j.ID, "boom")

	snap := s.Status()
	if snap.LastJob.FinishedAt == "" {
		t.Error("a failed job must record finishedAt")
	}
	if failed := phase(t, snap.LastJob, "end-session"); failed.FinishedAt == "" {
		t.Error("the failing phase must record finishedAt")
	}
	if unreached := phase(t, snap.LastJob, "verify"); unreached.FinishedAt != "" {
		t.Errorf("an unreached phase must not record finishedAt, got %q", unreached.FinishedAt)
	}
}

func TestSetPhaseDetailTracksTheRunningPhase(t *testing.T) {
	s := NewStore(stepClock())
	j, _ := s.Begin("reset", "", testPhases())
	s.StartPhase(j.ID, "end-session")

	s.SetPhaseDetail(j.ID, "end-session", "Preparing nodes")
	if got := phase(t, s.Status().Job, "end-session").Detail; got != "Preparing nodes" {
		t.Fatalf("detail = %q, want %q", got, "Preparing nodes")
	}

	// The newest line replaces the previous one — this is a tail, not a log.
	s.SetPhaseDetail(j.ID, "end-session", "Installing CNI")
	if got := phase(t, s.Status().Job, "end-session").Detail; got != "Installing CNI" {
		t.Fatalf("detail = %q, want the newest line", got)
	}

	// A stale job id must not write into the live job.
	s.SetPhaseDetail("job-999", "end-session", "from a dead goroutine")
	if got := phase(t, s.Status().Job, "end-session").Detail; got != "Installing CNI" {
		t.Fatalf("stale SetPhaseDetail overwrote the live phase: %q", got)
	}
}

func TestCompletedPhaseKeepsNoStaleDetail(t *testing.T) {
	s := NewStore(stepClock())
	j, _ := s.Begin("reset", "", testPhases())
	s.StartPhase(j.ID, "end-session")
	s.SetPhaseDetail(j.ID, "end-session", "Installing CNI")
	s.StartPhase(j.ID, "wipe-instances")

	// A settled row shows its duration, not the last thing it happened to
	// print — a frozen half-finished log line reads as a stuck phase.
	if got := phase(t, s.Status().Job, "end-session").Detail; got != "" {
		t.Fatalf("finished phase kept detail %q, want it cleared", got)
	}
}

func mustParse(t *testing.T, stamp string) time.Time {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339Nano, stamp)
	if err != nil {
		t.Fatalf("timestamp %q is not RFC3339Nano: %v", stamp, err)
	}
	return parsed
}

func phase(t *testing.T, j *Job, id string) Phase {
	t.Helper()
	for _, p := range j.Phases {
		if p.ID == id {
			return p
		}
	}
	t.Fatalf("phase %s not found in %+v", id, j.Phases)
	return Phase{}
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

func TestLogRetainsLinesAndDropsTheOldest(t *testing.T) {
	s := NewStore(fixedClock())
	j, _ := s.Begin("reset", "", testPhases())

	s.AppendLog(j.ID, "first")
	for i := 0; i < maxLogLines; i++ {
		s.AppendLog(j.ID, "line")
	}

	jobID, lines := s.Log()
	if jobID != j.ID {
		t.Fatalf("Log() jobID = %q, want %q", jobID, j.ID)
	}
	if len(lines) != maxLogLines {
		t.Fatalf("len(lines) = %d, want %d (bounded)", len(lines), maxLogLines)
	}
	if lines[0] != "line" {
		t.Fatalf("lines[0] = %q, want the oldest line dropped", lines[0])
	}
}

func TestLogSurvivesSettlementButNotTheNextJob(t *testing.T) {
	s := NewStore(fixedClock())
	j, _ := s.Begin("reset", "", testPhases())
	s.AppendLog(j.ID, "kept")
	s.Fail(j.ID, "boom")

	// A failed job's log is exactly the one worth reading.
	if _, lines := s.Log(); len(lines) != 1 || lines[0] != "kept" {
		t.Fatalf("log after Fail = %v, want [kept]", lines)
	}
	// Settled means no more writes: a goroutine still draining the dead
	// job's output must not grow its log.
	s.AppendLog(j.ID, "stale")
	if _, lines := s.Log(); len(lines) != 1 {
		t.Fatalf("log grew after settlement: %v", lines)
	}

	j2, _ := s.Begin("switch", "kcna-mock", testPhases())
	if jobID, lines := s.Log(); jobID != j2.ID || len(lines) != 0 {
		t.Fatalf("new job inherited the old log: id=%q lines=%v", jobID, lines)
	}
}

func TestLogTruncatesOversizedLines(t *testing.T) {
	s := NewStore(fixedClock())
	j, _ := s.Begin("reset", "", testPhases())

	long := make([]byte, maxLogLineBytes+100)
	for i := range long {
		long[i] = 'x'
	}
	s.AppendLog(j.ID, string(long))

	if _, lines := s.Log(); len(lines[0]) != maxLogLineBytes {
		t.Fatalf("len(lines[0]) = %d, want %d", len(lines[0]), maxLogLineBytes)
	}
}
