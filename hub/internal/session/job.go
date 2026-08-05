package session

import (
	"strconv"
	"sync"
	"time"
)

// A hosted reset or switch is a Pod recycle, and it is reported in the
// conductor's job shape on purpose.
//
// The UI's ControlProgress polls GET /api/control/status and renders
// whatever phase list it finds. Emitting the same JSON here means reset
// and switch keep working in hosted mode with no hosted branch in the
// UI — the phases differ (there is no cluster to rebuild in place, the
// Pod is simply replaced) but the protocol does not.
//
// This is a per-user job store, not the conductor's global one: two
// candidates resetting at the same moment are two independent Pods, and
// the conductor's "exactly one job at a time" rule is a property of one
// session, not of the deployment.

const maxLogLines = 200

// PhaseState mirrors the conductor's vocabulary exactly; the UI switches
// on these strings.
type PhaseState string

const (
	PhasePending PhaseState = "pending"
	PhaseRunning PhaseState = "running"
	PhaseDone    PhaseState = "done"
	PhaseFailed  PhaseState = "failed"
)

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
	Bank       string  `json:"bank,omitempty"`
	StartedAt  string  `json:"startedAt"`
	FinishedAt string  `json:"finishedAt,omitempty"`
	Phase      string  `json:"phase"`
	Error      string  `json:"error,omitempty"`
	Phases     []Phase `json:"phases"`
}

// Snapshot is what GET /api/control/status returns.
type Snapshot struct {
	Busy bool `json:"busy"`
	Job  *Job `json:"job,omitempty"`
	Last *Job `json:"last,omitempty"`
}

// jobStore holds one user's in-flight job and their last finished one.
type jobStore struct {
	mu      sync.Mutex
	current *Job
	last    *Job
	lines   []string
	logJob  string
	seq     int
	now     func() time.Time
}

func (s *jobStore) clock() time.Time {
	if s.now != nil {
		return s.now()
	}
	return time.Now()
}

func stamp(t time.Time) string { return t.UTC().Format(time.RFC3339) }

// begin starts a job. Returns false when one is already in flight, which
// the HTTP layer maps to 409 exactly as the conductor does.
func (s *jobStore) begin(op, bank string, phases []Phase) (Job, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.current != nil {
		return Job{}, false
	}
	s.seq++
	j := &Job{
		ID:        "job-" + strconv.Itoa(s.seq),
		Op:        op,
		Bank:      bank,
		StartedAt: stamp(s.clock()),
		Phases:    append([]Phase(nil), phases...),
	}
	for i := range j.Phases {
		j.Phases[i].State = PhasePending
	}
	s.current = j
	s.lines, s.logJob = nil, j.ID
	return *j.copy(), true
}

// enter marks a phase running and the previous one done.
func (s *jobStore) enter(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.current == nil {
		return
	}
	now := stamp(s.clock())
	for i := range s.current.Phases {
		p := &s.current.Phases[i]
		switch {
		case p.ID == id:
			p.State, p.StartedAt = PhaseRunning, now
			s.current.Phase = id
		case p.State == PhaseRunning:
			p.State, p.FinishedAt = PhaseDone, now
		}
	}
}

// detail replaces the one-line tail shown against the running phase.
func (s *jobStore) detail(text string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.current == nil {
		return
	}
	for i := range s.current.Phases {
		if s.current.Phases[i].State == PhaseRunning {
			s.current.Phases[i].Detail = text
		}
	}
}

func (s *jobStore) log(line string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(line) > 500 {
		line = line[:500] + "…"
	}
	s.lines = append(s.lines, line)
	if len(s.lines) > maxLogLines {
		s.lines = s.lines[len(s.lines)-maxLogLines:]
	}
}

// finish closes the job out. err nil means every phase succeeded.
func (s *jobStore) finish(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.current == nil {
		return
	}
	now := stamp(s.clock())
	for i := range s.current.Phases {
		p := &s.current.Phases[i]
		if p.State != PhaseRunning {
			continue
		}
		p.FinishedAt = now
		if err != nil {
			p.State = PhaseFailed
		} else {
			p.State = PhaseDone
		}
	}
	if err != nil {
		s.current.Error = err.Error()
	}
	s.current.FinishedAt = now
	s.last, s.current = s.current, nil
}

func (s *jobStore) snapshot() Snapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	return Snapshot{Busy: s.current != nil, Job: s.current.copy(), Last: s.last.copy()}
}

// op reports the operation of the job in flight, or "" when there is
// none. A narrower read than snapshot(): snapshot deep-copies both
// current and last, phases slice and all, to hand a caller a Job it can
// keep past the lock — which Status needs and Manager.Get does not.
// handleProxy calls Get on every proxied request, so before this existed
// every asset and every poll paid for two Job copies and two []Phase
// allocations to learn one string.
func (s *jobStore) op() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.current == nil {
		return ""
	}
	return s.current.Op
}

func (s *jobStore) logLines() (string, []string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.logJob, append([]string(nil), s.lines...)
}

// copy is what keeps a snapshot from aliasing live state: the phases
// slice is mutated in place by every enter() while the caller is still
// encoding the JSON.
func (j *Job) copy() *Job {
	if j == nil {
		return nil
	}
	out := *j
	out.Phases = append([]Phase(nil), j.Phases...)
	return &out
}
