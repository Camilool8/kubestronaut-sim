// Package job tracks the conductor's single in-flight control operation
// (a reset, a bank switch, or seeding a pooled bank's drawn questions)
// as a sequence of named phases, so the UI can render live progress and
// a terminal outcome. Exactly one job may run at a time: control
// operations rebuild cluster state and must never interleave.
package job

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// ErrBusy is returned by Begin while another job is still in flight. The
// HTTP layer maps it to 409 Conflict.
var ErrBusy = errors.New("job: another control operation is in flight")

// maxLogLines bounds the retained build log. The wipe and bootstrap
// phases print a few hundred lines over several minutes; 200 keeps the
// recent story without turning the store into a log file.
const maxLogLines = 200

// maxLogLineBytes truncates a single retained line. kind and bootstrap
// lines are short; anything longer is a wall of output nobody reads in
// a 12rem pane.
const maxLogLineBytes = 500

// PhaseState is the lifecycle of one phase within a job.
type PhaseState string

const (
	PhasePending PhaseState = "pending"
	PhaseRunning PhaseState = "running"
	PhaseDone    PhaseState = "done"
	PhaseFailed  PhaseState = "failed"
)

// PhaseSpec names one phase of a job when it is begun.
type PhaseSpec struct {
	ID    string
	Label string
}

// Phase is one entry of a job's progress checklist.
//
// StartedAt/FinishedAt exist so the UI can show a live duration on the
// running phase and a settled one on each finished phase: a control job
// holds a single phase for minutes at a time, and without timing there
// is nothing on screen that changes between polls. Detail carries the
// most recent line of output from the phase's command (kind's own
// "Preparing nodes" / "Installing CNI" progress, bootstrap.sh's
// milestones) — a one-line tail, not a log.
type Phase struct {
	ID         string     `json:"id"`
	Label      string     `json:"label"`
	State      PhaseState `json:"state"`
	StartedAt  string     `json:"startedAt,omitempty"`
	FinishedAt string     `json:"finishedAt,omitempty"`
	Detail     string     `json:"detail,omitempty"`
}

// Job is one control operation's progress record. Snapshots returned by
// Status are deep copies — callers can never mutate store state.
//
// Op's fourth value, "provision", is a switch run in an environment that
// has never had an exam: the same sequence minus the two phases that
// only mean something when there is an outgoing one. It gets a label of
// its own because the UI titles the job from it, and "Switching to CKAD"
// is the wrong thing to tell somebody choosing their first exam.
type Job struct {
	ID         string  `json:"id"`
	Op         string  `json:"op"`   // "reset" | "switch" | "provision" | "seed"
	Bank       string  `json:"bank"` // target bank for switch, provision and seed, "" for reset
	StartedAt  string  `json:"startedAt"`
	FinishedAt string  `json:"finishedAt,omitempty"`
	Phase      string  `json:"phase"` // id of the phase currently running ("" before the first)
	Error      string  `json:"error,omitempty"`
	Phases     []Phase `json:"phases"`
	done       bool
}

// Snapshot is Status's view: whether a job is in flight, that job, and
// the most recently finished one.
type Snapshot struct {
	Busy    bool `json:"busy"`
	Job     *Job `json:"job,omitempty"`
	LastJob *Job `json:"lastJob,omitempty"`
}

// Store owns the single-job state. Safe for concurrent use.
type Store struct {
	mu      sync.Mutex
	clock   func() time.Time
	seq     int
	current *Job
	last    *Job

	// log holds the retained command output of the job named logJobID —
	// the in-flight job, or the last one once it settles (a failed job's
	// log is exactly the one worth reading). Kept outside Job so Status
	// snapshots stay small; served by its own endpoint.
	log      []string
	logJobID string
}

// NewStore returns an empty store; clock stands in for time.Now so tests
// can pin StartedAt.
func NewStore(clock func() time.Time) *Store {
	return &Store{clock: clock}
}

// Begin starts a new job unless one is already in flight (ErrBusy). The
// returned Job is a copy; use its ID with the transition methods.
func (s *Store) Begin(op, bank string, phases []PhaseSpec) (Job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.current != nil {
		return Job{}, ErrBusy
	}

	s.seq++
	j := &Job{
		ID:        fmt.Sprintf("job-%d", s.seq),
		Op:        op,
		Bank:      bank,
		StartedAt: s.stampLocked(),
	}
	for _, p := range phases {
		j.Phases = append(j.Phases, Phase{ID: p.ID, Label: p.Label, State: PhasePending})
	}
	s.current = j
	// A new job owns the log from its first line; the previous job's
	// retained output would otherwise leak into this one's pane.
	s.log = nil
	s.logJobID = j.ID
	return *cloneJob(j), nil
}

// AppendLog retains one line of command output for job jobID, dropping
// the oldest line beyond maxLogLines. Calls naming a job that is no
// longer current are ignored — the same stale-goroutine guard as
// SetPhaseDetail.
func (s *Store) AppendLog(jobID, line string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.currentIfLocked(jobID) == nil {
		return
	}
	if len(line) > maxLogLineBytes {
		line = line[:maxLogLineBytes]
	}
	if len(s.log) == maxLogLines {
		copy(s.log, s.log[1:])
		s.log[len(s.log)-1] = line
		return
	}
	s.log = append(s.log, line)
}

// Log returns the retained build log and the job it belongs to: the
// in-flight job while one runs, otherwise the last settled one.
func (s *Store) Log() (jobID string, lines []string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.logJobID, append([]string(nil), s.log...)
}

// StartPhase marks phase id as running on job jobID, completing any
// previously running phase. Calls naming a job that is no longer current
// are ignored.
func (s *Store) StartPhase(jobID, id string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	j := s.currentIfLocked(jobID)
	if j == nil {
		return
	}
	now := s.stampLocked()
	for i := range j.Phases {
		if j.Phases[i].State == PhaseRunning {
			j.Phases[i].State = PhaseDone
			j.Phases[i].FinishedAt = now
			// A settled row shows its duration, not the last line it
			// happened to print; a frozen half-finished line reads as
			// a phase that is still working.
			j.Phases[i].Detail = ""
		}
		if j.Phases[i].ID == id {
			j.Phases[i].State = PhaseRunning
			j.Phases[i].StartedAt = now
		}
	}
	j.Phase = id
}

// SetPhaseDetail replaces phase id's one-line output tail on job jobID.
// Calls naming a stale job (or a phase that has already settled) are
// ignored, so a goroutine still draining a dead job's output can never
// write into the live one.
func (s *Store) SetPhaseDetail(jobID, id, detail string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	j := s.currentIfLocked(jobID)
	if j == nil {
		return
	}
	for i := range j.Phases {
		if j.Phases[i].ID == id && j.Phases[i].State == PhaseRunning {
			j.Phases[i].Detail = detail
			return
		}
	}
}

// Complete finishes job jobID successfully: every non-failed phase is
// marked done and the job becomes LastJob. Ignored for stale IDs.
func (s *Store) Complete(jobID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	j := s.currentIfLocked(jobID)
	if j == nil {
		return
	}
	now := s.stampLocked()
	for i := range j.Phases {
		if j.Phases[i].State == PhaseRunning || j.Phases[i].State == PhasePending {
			j.Phases[i].State = PhaseDone
			j.Phases[i].FinishedAt = now
			j.Phases[i].Detail = ""
		}
	}
	j.FinishedAt = now
	j.done = true
	s.last = j
	s.current = nil
}

// Fail finishes job jobID with msg: the currently running phase is
// marked failed (unreached phases stay pending) and the job becomes
// LastJob. Ignored for stale IDs.
func (s *Store) Fail(jobID, msg string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	j := s.currentIfLocked(jobID)
	if j == nil {
		return
	}
	now := s.stampLocked()
	for i := range j.Phases {
		if j.Phases[i].State == PhaseRunning {
			j.Phases[i].State = PhaseFailed
			j.Phases[i].FinishedAt = now
		}
	}
	j.Error = msg
	j.FinishedAt = now
	j.done = true
	s.last = j
	s.current = nil
}

// Status reports the store's current view with deep-copied jobs.
func (s *Store) Status() Snapshot {
	s.mu.Lock()
	defer s.mu.Unlock()

	return Snapshot{
		Busy:    s.current != nil,
		Job:     cloneJob(s.current),
		LastJob: cloneJob(s.last),
	}
}

// stampLocked returns the current time in the wire format every
// timestamp in this package uses. Nanosecond precision matters: several
// phases finish in well under a second, and at second resolution they
// would all render as "0s". The caller must hold s.mu.
func (s *Store) stampLocked() string {
	return s.clock().UTC().Format(time.RFC3339Nano)
}

// currentIfLocked returns the in-flight job only if it matches jobID.
// The caller must hold s.mu.
func (s *Store) currentIfLocked(jobID string) *Job {
	if s.current == nil || s.current.ID != jobID {
		return nil
	}
	return s.current
}

func cloneJob(j *Job) *Job {
	if j == nil {
		return nil
	}
	c := *j
	c.Phases = append([]Phase(nil), j.Phases...)
	return &c
}
