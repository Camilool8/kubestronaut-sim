package bootstate

import (
	"encoding/json"
	"os"
	"sync"
	"time"
)

const (
	StateBooting = "booting"
	StateReady   = "ready"
	StateFailed  = "failed"
	StateIdle    = "idle"
)

type State struct {
	State      string `json:"state"`
	Phase      string `json:"phase"`
	Label      string `json:"label"`
	Detail     string `json:"detail"`
	Error      string `json:"error"`
	Step       int    `json:"step"`
	TotalSteps int    `json:"totalSteps"`
	StartedAt  string `json:"startedAt"`
}

func (s State) Ready() bool { return s.State == StateReady }

func (s State) Idle() bool { return s.State == StateIdle }

type Reader struct {
	path        string
	readyMarker string

	mu       sync.Mutex
	cached   State
	cachedAt time.Time
	now      func() time.Time
}

const cacheTTL = time.Second

func New(path, readyMarker string) *Reader {
	return &Reader{path: path, readyMarker: readyMarker, now: time.Now}
}

func (r *Reader) Read() State {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := r.now()
	if !r.cachedAt.IsZero() && now.Sub(r.cachedAt) < cacheTTL {
		return r.cached
	}

	s := r.read()
	r.cached, r.cachedAt = s, now
	return s
}

func (r *Reader) read() State {

	_, err := os.Stat(r.readyMarker)
	ready := err == nil

	raw, readErr := os.ReadFile(r.path)
	if readErr != nil {
		return r.fallback(ready)
	}

	var s State
	if err := json.Unmarshal(raw, &s); err != nil || s.State == "" {
		return r.fallback(ready)
	}

	switch {
	case ready:

		s.State = StateReady
		s.Error = ""
	case s.State == StateReady:

		s.State = StateBooting
	}

	return s
}

func (r *Reader) fallback(ready bool) State {
	if ready {
		return State{State: StateReady, Phase: "ready", Label: "Environment ready"}
	}
	return State{
		State: StateBooting,
		Phase: "starting",
		Label: "Starting the exam environment",
	}
}
