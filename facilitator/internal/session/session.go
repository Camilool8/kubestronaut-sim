// Package session implements the exam-session state machine: a single
// idle → running → ended lifecycle persisted as one JSON file on disk.
//
// Remaining time is always derived from startedAt + duration − clock()
// (never a decremented counter), so it reads correctly regardless of how
// long the process has been running or been restarted. A real time.Timer
// independently auto-ends a running session at expiry even if nothing
// ever asks for its state; Snapshot also lazily expires a running session
// past 0:00 as a backstop. Both paths funnel through the same guarded
// transition, so onExpire fires at most once per running session.
//
// All exported methods are safe for concurrent use: a single mutex guards
// the in-memory state, and onExpire is always invoked outside that lock
// (never while it is held), so an onExpire implementation may safely call
// back into the Manager (e.g. to kick asynchronous grading) without
// deadlocking.
package session

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Session states. Snapshot.State holds exactly one of these values.
const (
	stateIdle    = "idle"
	stateRunning = "running"
	stateEnded   = "ended"
)

// reasonExpired is the EndReason the package itself assigns when a
// running session is ended by the timer or a lazy expiry check, as
// opposed to reasons supplied by callers of End (e.g. "submitted").
const reasonExpired = "expired"

// ErrConflict is returned by state-transition methods called from a state
// that does not permit the requested transition (e.g. Start on an
// already-running session). The HTTP API layer maps it to 409 Conflict.
var ErrConflict = errors.New("session: invalid state transition")

// Manager owns one exam session's state machine and its on-disk
// persistence. Create one with New; all exported methods are
// goroutine-safe.
type Manager struct {
	mu       sync.Mutex
	path     string
	dur      time.Duration
	clock    func() time.Time
	onExpire func()
	timer    *time.Timer

	state      string
	startedAt  time.Time
	endedAt    time.Time
	endReason  string
	results    json.RawMessage
	gradeError string
}

// Snapshot is a read-only view of a session at one instant.
type Snapshot struct {
	State            string    // "idle" | "running" | "ended"
	StartedAt        time.Time // zero when never started
	DurationSeconds  int
	RemainingSeconds int    // 0 when not running
	EndReason        string // "" | "submitted" | "expired"
}

// persistedState is the on-disk JSON shape written and read at path.
// Version allows future migration.
type persistedState struct {
	Version         int             `json:"version"`
	State           string          `json:"state"`
	StartedAt       time.Time       `json:"startedAt"`
	DurationSeconds int             `json:"durationSeconds"`
	EndedAt         *time.Time      `json:"endedAt"`
	EndReason       string          `json:"endReason"`
	Results         json.RawMessage `json:"results"`
	GradeError      string          `json:"gradeError"`
}

// New loads the session persisted at path, or starts idle if the file is
// missing or unreadable/corrupt (any non-missing read or parse failure is
// logged to stderr; a missing file is the expected first-run condition
// and is silent). It never fails just because of a bad or absent session
// file.
//
// dur is the exam duration to use for all remaining-time math; it always
// comes from this call's argument, never from the persisted file (so a
// changed duration between process restarts — e.g. a test override —
// takes effect immediately). clock stands in for time.Now so tests can
// control the passage of time; only the timer's firing mechanism uses
// real wall-clock time.
//
// A persisted "running" session is resumed: if clock() shows time still
// remaining until startedAt+dur, a real timer is armed for exactly that
// remainder. If it is already past expiry, the session is ended as
// "expired" and persisted before New returns — but onExpire is NOT
// invoked for this load-time correction, since no timer or live Snapshot
// call actually observed the expiry happen; it fires only for expiries a
// running process experiences. Callers that need to notice an
// already-ended, not-yet-graded session on boot should inspect the first
// Snapshot themselves.
func New(path string, dur time.Duration, clock func() time.Time, onExpire func()) (*Manager, error) {
	m := &Manager{
		path:     path,
		dur:      dur,
		clock:    clock,
		onExpire: onExpire,
		state:    stateIdle,
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		if !os.IsNotExist(err) {
			fmt.Fprintf(os.Stderr, "session: read %s: %v (starting idle)\n", path, err)
		}
		return m, nil
	}

	var doc persistedState
	if err := json.Unmarshal(raw, &doc); err != nil {
		fmt.Fprintf(os.Stderr, "session: corrupt session file %s: %v (starting idle)\n", path, err)
		return m, nil
	}
	switch doc.State {
	case stateIdle, stateRunning, stateEnded:
	default:
		fmt.Fprintf(os.Stderr, "session: session file %s has unknown state %q (starting idle)\n", path, doc.State)
		return m, nil
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	m.state = doc.State
	m.startedAt = doc.StartedAt
	m.endReason = doc.EndReason
	m.results = doc.Results
	m.gradeError = doc.GradeError
	if doc.EndedAt != nil {
		m.endedAt = *doc.EndedAt
	}

	if m.state == stateRunning {
		if m.remainingLocked() <= 0 {
			if err := m.transitionToEndedLocked(reasonExpired); err != nil {
				fmt.Fprintf(os.Stderr, "session: persist expiry on load %s: %v\n", path, err)
			}
		} else {
			m.armTimerLocked(m.remainingLocked())
		}
	}

	return m, nil
}

// Start moves an idle session to running, recording startedAt as
// clock() and arming the expiry timer for the full duration. It returns
// ErrConflict if the session is not idle.
func (m *Manager) Start() (Snapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.state != stateIdle {
		return Snapshot{}, fmt.Errorf("session: start: %w", ErrConflict)
	}

	m.state = stateRunning
	m.startedAt = m.clock()
	m.endedAt = time.Time{}
	m.endReason = ""
	m.results = nil
	m.gradeError = ""

	if err := m.persistLocked(); err != nil {
		return Snapshot{}, fmt.Errorf("session: start: %w", err)
	}
	m.armTimerLocked(m.dur)

	return m.snapshotLocked(), nil
}

// End moves a running session to ended, recording reason and endedAt as
// clock(). It also permits re-calling End on an already-ended session
// that has no results yet (a recovery re-grade after a failed or
// interrupted grading attempt) as a no-op success — the original
// endedAt/reason are preserved. It returns ErrConflict if the session is
// idle, or already ended with results recorded.
func (m *Manager) End(reason string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	switch m.state {
	case stateRunning:
		if err := m.transitionToEndedLocked(reason); err != nil {
			return fmt.Errorf("session: end: %w", err)
		}
		return nil
	case stateEnded:
		if len(m.results) > 0 {
			return fmt.Errorf("session: end: already graded: %w", ErrConflict)
		}
		return nil
	default:
		return fmt.Errorf("session: end: %w", ErrConflict)
	}
}

// Reset returns the session to idle from any state, clearing startedAt,
// endedAt, endReason, results, and gradeError, and cancelling any armed
// timer. It always succeeds.
func (m *Manager) Reset() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.stopTimerLocked()
	m.state = stateIdle
	m.startedAt = time.Time{}
	m.endedAt = time.Time{}
	m.endReason = ""
	m.results = nil
	m.gradeError = ""

	if err := m.persistLocked(); err != nil {
		return fmt.Errorf("session: reset: %w", err)
	}
	return nil
}

// Snapshot returns the session's current state. If it is running and
// clock() shows the duration has elapsed, Snapshot first lazily ends the
// session as "expired" (persisting the transition) and invokes onExpire
// — this is the backstop for the real timer, guaranteeing a caller never
// observes stale "running" state past 0:00 even if the timer callback
// hasn't run yet.
func (m *Manager) Snapshot() Snapshot {
	m.mu.Lock()
	expired := m.checkExpiryLocked()
	snap := m.snapshotLocked()
	m.mu.Unlock()

	if expired && m.onExpire != nil {
		m.onExpire()
	}
	return snap
}

// SetResults records the graded results for the current session and
// clears any prior gradeError (a successful grade supersedes an earlier
// failed attempt).
func (m *Manager) SetResults(r json.RawMessage) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.results = r
	m.gradeError = ""
	if err := m.persistLocked(); err != nil {
		return fmt.Errorf("session: set results: %w", err)
	}
	return nil
}

// SetGradeError records that grading failed with the given message, so
// /api/results can surface it and a caller can retry via End.
func (m *Manager) SetGradeError(msg string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.gradeError = msg
	if err := m.persistLocked(); err != nil {
		return fmt.Errorf("session: set grade error: %w", err)
	}
	return nil
}

// Results returns the current results, gradeError, and whether grading
// has reached a terminal outcome (results were set, or grading failed and
// gradeError was set) — the third value distinguishes "still grading"
// from "done, one way or the other".
func (m *Manager) Results() (results json.RawMessage, gradeError string, graded bool) {
	m.mu.Lock()
	defer m.mu.Unlock()

	graded = len(m.results) > 0 || m.gradeError != ""
	return m.results, m.gradeError, graded
}

// remainingLocked returns the time left until expiry (dur since
// startedAt as measured by clock()), clamped to zero. The caller must
// hold m.mu.
func (m *Manager) remainingLocked() time.Duration {
	remaining := m.dur - m.clock().Sub(m.startedAt)
	if remaining < 0 {
		remaining = 0
	}
	return remaining
}

// checkExpiryLocked lazily ends a running session whose time has run
// out, returning whether it did so (in which case the caller must invoke
// onExpire after releasing m.mu). The caller must hold m.mu.
func (m *Manager) checkExpiryLocked() bool {
	if m.state != stateRunning || m.remainingLocked() > 0 {
		return false
	}
	if err := m.transitionToEndedLocked(reasonExpired); err != nil {
		fmt.Fprintf(os.Stderr, "session: persist expiry: %v\n", err)
	}
	return true
}

// transitionToEndedLocked moves the session to ended with the given
// reason, stops any armed timer, and persists the change. The caller
// must hold m.mu.
func (m *Manager) transitionToEndedLocked(reason string) error {
	m.stopTimerLocked()
	m.state = stateEnded
	m.endedAt = m.clock()
	m.endReason = reason
	return m.persistLocked()
}

// armTimerLocked (re-)arms the real expiry timer for d, replacing any
// timer already set. The caller must hold m.mu.
func (m *Manager) armTimerLocked(d time.Duration) {
	if d < 0 {
		d = 0
	}
	m.timer = time.AfterFunc(d, m.onTimerFire)
}

// stopTimerLocked cancels the armed timer, if any. The caller must hold
// m.mu.
func (m *Manager) stopTimerLocked() {
	if m.timer != nil {
		m.timer.Stop()
		m.timer = nil
	}
}

// onTimerFire runs on the timer's own goroutine when a running session's
// duration elapses in real time. It must not be called with m.mu held.
func (m *Manager) onTimerFire() {
	m.mu.Lock()
	expired := m.checkExpiryLocked()
	m.mu.Unlock()

	if expired && m.onExpire != nil {
		m.onExpire()
	}
}

// snapshotLocked builds a Snapshot from the current in-memory state. The
// caller must hold m.mu.
func (m *Manager) snapshotLocked() Snapshot {
	snap := Snapshot{
		State:           m.state,
		StartedAt:       m.startedAt,
		DurationSeconds: int(m.dur.Seconds()),
		EndReason:       m.endReason,
	}
	if m.state == stateRunning {
		snap.RemainingSeconds = int(m.remainingLocked().Seconds())
	}
	return snap
}

// persistLocked atomically writes the current in-memory state to m.path
// (os.CreateTemp in the same directory, then os.Rename). The caller must
// hold m.mu.
func (m *Manager) persistLocked() error {
	doc := persistedState{
		Version:         1,
		State:           m.state,
		StartedAt:       m.startedAt,
		DurationSeconds: int(m.dur.Seconds()),
		EndReason:       m.endReason,
		Results:         m.results,
		GradeError:      m.gradeError,
	}
	if !m.endedAt.IsZero() {
		endedAt := m.endedAt
		doc.EndedAt = &endedAt
	}

	data, err := json.Marshal(&doc)
	if err != nil {
		return fmt.Errorf("session: marshal: %w", err)
	}

	dir := filepath.Dir(m.path)
	tmp, err := os.CreateTemp(dir, ".session-*.tmp")
	if err != nil {
		return fmt.Errorf("session: create temp file in %s: %w", dir, err)
	}
	tmpPath := tmp.Name()

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("session: write %s: %w", tmpPath, err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("session: close %s: %w", tmpPath, err)
	}
	if err := os.Rename(tmpPath, m.path); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("session: rename %s to %s: %w", tmpPath, m.path, err)
	}
	return nil
}
