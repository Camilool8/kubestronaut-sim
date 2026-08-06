package job

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

var ErrBusy = errors.New("job: another control operation is in flight")

const maxLogLines = 200

const maxLogLineBytes = 500

type PhaseState string

const (
	PhasePending PhaseState = "pending"
	PhaseRunning PhaseState = "running"
	PhaseDone    PhaseState = "done"
	PhaseFailed  PhaseState = "failed"
)

type PhaseSpec struct {
	ID    string
	Label string
}

type Phase struct {
	ID         string     `json:"id"`
	Label      string     `json:"label"`
	State      PhaseState `json:"state"`
	StartedAt  string     `json:"startedAt,omitempty"`
	FinishedAt string     `json:"finishedAt,omitempty"`
	Detail     string     `json:"detail,omitempty"`
}

type Job struct {
	ID         string  `json:"id"`
	Op         string  `json:"op"`
	Bank       string  `json:"bank"`
	StartedAt  string  `json:"startedAt"`
	FinishedAt string  `json:"finishedAt,omitempty"`
	Phase      string  `json:"phase"`
	Error      string  `json:"error,omitempty"`
	Phases     []Phase `json:"phases"`
	done       bool
}

type Snapshot struct {
	Busy    bool `json:"busy"`
	Job     *Job `json:"job,omitempty"`
	LastJob *Job `json:"lastJob,omitempty"`
}

type Store struct {
	mu      sync.Mutex
	clock   func() time.Time
	seq     int
	current *Job
	last    *Job

	log      []string
	logJobID string
}

func NewStore(clock func() time.Time) *Store {
	return &Store{clock: clock}
}

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

	s.log = nil
	s.logJobID = j.ID
	return *cloneJob(j), nil
}

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

func (s *Store) Log() (jobID string, lines []string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.logJobID, append([]string(nil), s.log...)
}

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

			j.Phases[i].Detail = ""
		}
		if j.Phases[i].ID == id {
			j.Phases[i].State = PhaseRunning
			j.Phases[i].StartedAt = now
		}
	}
	j.Phase = id
}

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

func (s *Store) Status() Snapshot {
	s.mu.Lock()
	defer s.mu.Unlock()

	return Snapshot{
		Busy:    s.current != nil,
		Job:     cloneJob(s.current),
		LastJob: cloneJob(s.last),
	}
}

func (s *Store) stampLocked() string {
	return s.clock().UTC().Format(time.RFC3339Nano)
}

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
