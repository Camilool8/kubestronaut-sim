// Package bootstate reports how far the exam environment has got
// through its own start-up.
//
// The facilitator used to wait for k8s-env to be healthy before it would
// start at all, which meant port 8080 served nothing for the whole of a
// cold first boot — the candidate's browser was dead for the entire time
// the thing they were waiting for was being built, and the only signal
// anywhere was one unmoving word from `docker compose up --wait`.
//
// Now the facilitator starts immediately and this package tells it what
// to say. k8s-env writes /shared/boot.json as it works (see
// images/k8s-env/phase.sh); this reads it, reconciles it against the
// /shared/ready marker, and hands the API a struct it can serve.
package bootstate

import (
	"encoding/json"
	"os"
	"sync"
	"time"
)

// Lifecycle values for State.State.
const (
	StateBooting = "booting"
	StateReady   = "ready"
	StateFailed  = "failed"
	// StateIdle is "up, and nothing to build yet": the container is
	// running and no exam has been chosen, so no cluster exists. It is
	// deliberately not a kind of booting. A boot screen narrates progress
	// and asks the candidate to wait; this state wants the opposite, which
	// is to get out of the way so they can pick an exam.
	StateIdle = "idle"
)

// State is one snapshot of the environment's start-up, and is the
// GET /api/boot response body.
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

// Ready reports whether the environment is usable — the one question
// callers outside this package actually branch on.
func (s State) Ready() bool { return s.State == StateReady }

// Idle reports whether the environment is waiting to be told what to
// build. Callers use it to tell "not yet" apart from "not asked".
func (s State) Idle() bool { return s.State == StateIdle }

// Reader reads the phase file written by k8s-env's bootstrap.
//
// It holds no state of its own beyond a short cache: every Read hits the
// disk, so a boot that advances is visible immediately and a boot that
// dies is never masked by a stale in-memory copy.
type Reader struct {
	path        string
	readyMarker string

	// The UI polls this every 2s and the file is tiny, but a stat plus a
	// read per request is still pointless work when several tabs are
	// open. One-second coalescing is short enough to be invisible.
	mu       sync.Mutex
	cached   State
	cachedAt time.Time
	now      func() time.Time
}

// cacheTTL coalesces concurrent polls without making the state stale
// enough for a human to notice.
const cacheTTL = time.Second

// New returns a Reader over the phase file at path, using readyMarker
// (conventionally /shared/ready) as the authority on readiness.
func New(path, readyMarker string) *Reader {
	return &Reader{path: path, readyMarker: readyMarker, now: time.Now}
}

// Read returns the current start-up state. It never fails: an
// unreadable, absent or malformed phase file all mean "we cannot see
// detail", which is reported as a generic booting state rather than an
// error. A missing file is the normal condition for the first few
// seconds of a boot and for any environment built before phase
// reporting existed.
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
	// The ready marker is the authority, in both directions, and that
	// second direction is the load-bearing one. Every service in the
	// stack gates on this file; bootstrap.sh removes it at the start of
	// every run and only recreates it at the end. So a phase file
	// claiming "ready" while the marker is gone is a stale artefact of
	// the previous boot, sitting there for the whole of a reset — trust
	// it and the UI would show a finished environment that is mid-
	// rebuild. Trusting the marker instead means this package can never
	// disagree with what the rest of the stack believes.
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
		// Belt and braces: a boot that finished between the phase file's
		// last write and this read is ready, whatever the file says.
		s.State = StateReady
		s.Error = ""
	case s.State == StateReady:
		// Stale, per the reasoning above.
		s.State = StateBooting
	}
	// StateIdle needs no case of its own and must not get one: it is not
	// ready, so the first arm does not fire, and it is not a stale
	// "ready", so the second does not either. It passes through as
	// written, which is correct — the marker's absence is exactly what
	// idle already claims.
	return s
}

// fallback is what we report when the phase file tells us nothing.
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
