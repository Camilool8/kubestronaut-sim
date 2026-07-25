// Package job tracks the conductor's single in-flight control operation
// (a reset or a bank switch) as a sequence of named phases, so the UI
// can render live progress and a terminal outcome. Exactly one job may
// run at a time: control operations rebuild cluster state and must never
// interleave.
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
type Phase struct {
	ID    string     `json:"id"`
	Label string     `json:"label"`
	State PhaseState `json:"state"`
}

// Job is one control operation's progress record. Snapshots returned by
// Status are deep copies — callers can never mutate store state.
type Job struct {
	ID        string  `json:"id"`
	Op        string  `json:"op"`   // "reset" | "switch"
	Bank      string  `json:"bank"` // target bank for switch, "" for reset
	StartedAt string  `json:"startedAt"`
	Phase     string  `json:"phase"` // id of the phase currently running ("" before the first)
	Error     string  `json:"error,omitempty"`
	Phases    []Phase `json:"phases"`
	done      bool
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
		StartedAt: s.clock().UTC().Format(time.RFC3339),
	}
	for _, p := range phases {
		j.Phases = append(j.Phases, Phase{ID: p.ID, Label: p.Label, State: PhasePending})
	}
	s.current = j
	return *cloneJob(j), nil
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
	for i := range j.Phases {
		if j.Phases[i].State == PhaseRunning {
			j.Phases[i].State = PhaseDone
		}
		if j.Phases[i].ID == id {
			j.Phases[i].State = PhaseRunning
		}
	}
	j.Phase = id
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
	for i := range j.Phases {
		if j.Phases[i].State == PhaseRunning || j.Phases[i].State == PhasePending {
			j.Phases[i].State = PhaseDone
		}
	}
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
	for i := range j.Phases {
		if j.Phases[i].State == PhaseRunning {
			j.Phases[i].State = PhaseFailed
		}
	}
	j.Error = msg
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
