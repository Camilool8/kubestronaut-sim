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
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// Session states. Snapshot.State holds exactly one of these values.
const (
	stateIdle    = "idle"
	stateRunning = "running"
	stateEnded   = "ended"
)

// Attempt modes. Mode is chosen once at Start and is immutable for the
// life of an attempt — every gate that depends on it (hints, solutions,
// mid-attempt grading) reads server-side state, never a request field.
const (
	// ModeExam is the real thing: the bank's duration, no help.
	ModeExam = "exam"
	// ModeTraining is untimed, with hints and solutions available while
	// the attempt runs. This is also the answer to WCAG 2.2.1 Timing
	// Adjustable, which a fixed unpausable countdown cannot satisfy.
	ModeTraining = "training"
	// ModeSpeed is half the bank's duration and no help, for candidates
	// who want the clock to hurt more than the real one does.
	ModeSpeed = "speed"
)

// ValidMode reports whether s names a mode this build understands.
func ValidMode(s string) bool {
	return s == ModeExam || s == ModeTraining || s == ModeSpeed
}

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
	bank     string
	dur      time.Duration
	clock    func() time.Time
	onExpire func()
	timer    *time.Timer

	// mode and attemptDur belong to the CURRENT attempt, not to the
	// manager: dur above is only the default Start falls back to. They
	// are persisted, so a resumed attempt keeps the clock it was started
	// with even if the process default has since changed.
	mode       string
	attemptDur time.Duration

	state      string
	attempt    string
	startedAt  time.Time
	endedAt    time.Time
	endReason  string
	results    json.RawMessage
	gradeError string

	// answers holds an mcq attempt's selections, qid → sorted option
	// indices. Never mutated in place: SetAnswer replaces the whole map,
	// so captureLocked/restoreLocked rollback stays correct with a plain
	// pointer copy. Always nil for a hands-on attempt — the cluster is
	// that engine's answer sheet.
	answers map[string][]int
}

// Snapshot is a read-only view of a session at one instant.
type Snapshot struct {
	State            string    // "idle" | "running" | "ended"
	Bank             string    // the bank this manager (and any session) belongs to
	StartedAt        time.Time // zero when never started
	DurationSeconds  int
	RemainingSeconds int    // 0 when not running, and when untimed
	EndReason        string // "" | "submitted" | "expired"
	Mode             string // "exam" | "training" | "speed"
	// Untimed is true for a training attempt. Callers must branch on this
	// rather than on RemainingSeconds == 0, which is also what an expired
	// attempt looks like.
	Untimed bool
}

// persistedState is the on-disk JSON shape written and read at path.
// Version allows future migration.
//
// Results uses omitempty: json.RawMessage's UnmarshalJSON copies its
// input bytes verbatim regardless of content, so a written literal null
// (what a nil RawMessage marshals to) would read back as the non-nil
// 4-byte RawMessage("null"), not nil — silently turning "not graded yet"
// into "graded". Omitting the key entirely when results is unset avoids
// ever writing that literal null, so a nil m.results reloads as nil.
type persistedState struct {
	Version         int             `json:"version"`
	Bank            string          `json:"bank"`
	Attempt         string          `json:"attempt"`
	State           string          `json:"state"`
	StartedAt       time.Time       `json:"startedAt"`
	DurationSeconds int             `json:"durationSeconds"`
	EndedAt         *time.Time      `json:"endedAt"`
	EndReason       string          `json:"endReason"`
	Mode            string          `json:"mode"`
	Results         json.RawMessage `json:"results,omitempty"`
	GradeError      string          `json:"gradeError"`
	// Answers is an mcq attempt's selections; absent for hands-on
	// attempts, which store nothing per question.
	Answers map[string][]int `json:"answers,omitempty"`
}

// persistedVersion is the on-disk format this build reads and writes.
// Version 1 files predate bank identity and attempt tokens; version 2
// predates attempt modes; version 3 predates mcq answer storage. All are
// discarded on load by the existing version guard, which is the whole
// migration: a discarded file starts the session idle, and an idle
// session has no mode or answers to migrate.
const persistedVersion = 4

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
func New(path, bank string, dur time.Duration, clock func() time.Time, onExpire func()) (*Manager, error) {
	m := &Manager{
		path:     path,
		bank:     bank,
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
	// A session may only be resumed by the bank it belongs to: v1 files
	// predate bank identity (unknown bank), and a file written by another
	// bank must never leak its state — or its results — into this one.
	if doc.Version != persistedVersion {
		fmt.Fprintf(os.Stderr, "session: session file %s has version %d, want %d (starting idle)\n", path, doc.Version, persistedVersion)
		return m, nil
	}
	if doc.Bank != bank {
		fmt.Fprintf(os.Stderr, "session: session file %s belongs to bank %q, active bank is %q (starting idle)\n", path, doc.Bank, bank)
		return m, nil
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	m.state = doc.State
	m.attempt = doc.Attempt
	m.startedAt = doc.StartedAt
	// The attempt resumes with the clock it was STARTED with, read back
	// off disk — v2 already wrote DurationSeconds and then ignored it on
	// load, so a resumed attempt silently inherited whatever the process
	// default happened to be. That is also what makes an untimed
	// training attempt survive `./sim down` + `./sim up`.
	m.attemptDur = time.Duration(doc.DurationSeconds) * time.Second
	m.mode = doc.Mode
	if m.mode == "" {
		m.mode = ModeExam
	}
	m.endReason = doc.EndReason
	m.results = doc.Results
	m.gradeError = doc.GradeError
	m.answers = doc.Answers
	if doc.EndedAt != nil {
		m.endedAt = *doc.EndedAt
	}

	if m.state == stateRunning {
		switch {
		case m.untimedLocked():
			// A resumed training attempt has no deadline and needs no
			// timer. Without this branch it takes the expiry path below
			// — remainingLocked on a zero duration is always <= 0 — so
			// every `./sim down` + `./sim up` would silently end an
			// untimed attempt the moment the process came back.
		case m.remainingLocked() <= 0:
			if err := m.transitionToEndedLocked(reasonExpired); err != nil {
				// Rolled back to running with no time left; there is no
				// timer to retry this (remaining is already <= 0), so it
				// stays running-in-memory until the next Snapshot call's
				// lazy-expiry backstop retries the persist.
				fmt.Fprintf(os.Stderr, "session: persist expiry on load %s: %v\n", path, err)
			}
		default:
			m.armTimerLocked(m.remainingLocked())
		}
	}

	return m, nil
}

// Start moves an idle session to running, recording startedAt as
// clock() and arming the expiry timer for the full duration. It returns
// ErrConflict if the session is not idle. If persisting the transition
// fails, the in-memory state is rolled back to idle (so a caller sees a
// clean error and can retry) rather than left running with nothing
// written to disk.
// mode selects the attempt's rules and dur its clock; dur <= 0 means
// untimed. Passing an unknown mode is a programming error and is
// rejected rather than silently treated as an exam.
func (m *Manager) Start(mode string, dur time.Duration) (Snapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !ValidMode(mode) {
		return Snapshot{}, fmt.Errorf("session: start: unknown mode %q", mode)
	}
	if m.state != stateIdle {
		return Snapshot{}, fmt.Errorf("session: start: %w", ErrConflict)
	}

	prev := m.captureLocked()
	m.mode = mode
	m.attemptDur = dur
	m.state = stateRunning
	m.attempt = newAttemptToken()
	m.startedAt = m.clock()
	m.endedAt = time.Time{}
	m.endReason = ""
	m.results = nil
	m.gradeError = ""
	m.answers = nil

	if err := m.persistLocked(); err != nil {
		m.restoreLocked(prev)
		return Snapshot{}, fmt.Errorf("session: start: %w", err)
	}
	m.armTimerLocked(m.attemptDur)

	return m.snapshotLocked(), nil
}

// newAttemptToken mints the random identity for one attempt. Grading
// runs capture it when they begin; SetResults/SetGradeError verify it,
// so a grade from attempt A can never be stamped onto attempt B even
// when both happen to be in the ended state.
func newAttemptToken() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		// crypto/rand failing means the platform's entropy source is
		// broken; fall back to the clock rather than refusing to start
		// an exam over a token whose only job is stale-write detection.
		return fmt.Sprintf("t-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b[:])
}

// AttemptToken returns the current attempt's token ("" when no attempt
// has been started, or after a Reset). A grader must capture this at the
// moment grading begins and pass it back to SetResults/SetGradeError.
func (m *Manager) AttemptToken() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.attempt
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
// timer. It always succeeds, unless persisting the reset fails, in which
// case the in-memory state (and armed timer, if any) is left exactly as
// it was.
func (m *Manager) Reset() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	prev := m.captureLocked()
	m.state = stateIdle
	m.attempt = ""
	m.startedAt = time.Time{}
	m.endedAt = time.Time{}
	m.endReason = ""
	m.results = nil
	m.gradeError = ""
	m.answers = nil

	if err := m.persistLocked(); err != nil {
		m.restoreLocked(prev)
		return fmt.Errorf("session: reset: %w", err)
	}
	m.stopTimerLocked()
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

// SetResults records the graded results for the attempt identified by
// token and clears any prior gradeError (a successful grade supersedes
// an earlier failed attempt). It returns ErrConflict without modifying
// anything unless the session is currently ended AND token matches the
// current attempt: an asynchronous grading run is keyed to the attempt
// that was ended when it began, and if the operator has since Reset —
// even through a full second start/end lifecycle — that late write must
// not stamp a previous attempt's results onto the new session state. On
// a persist failure, results/gradeError are also left unchanged.
func (m *Manager) SetResults(token string, r json.RawMessage) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if err := m.checkGradeWriteLocked(token); err != nil {
		return fmt.Errorf("session: set results: %w", err)
	}

	prev := m.captureLocked()
	m.results = r
	m.gradeError = ""
	if err := m.persistLocked(); err != nil {
		m.restoreLocked(prev)
		return fmt.Errorf("session: set results: %w", err)
	}
	return nil
}

// SetGradeError records that grading the attempt identified by token
// failed with the given message, so /api/results can surface it and a
// caller can retry via End. Like SetResults, it returns ErrConflict
// without modifying anything unless the session is ended and token
// matches the current attempt. On a persist failure, gradeError is also
// left unchanged.
func (m *Manager) SetGradeError(token, msg string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if err := m.checkGradeWriteLocked(token); err != nil {
		return fmt.Errorf("session: set grade error: %w", err)
	}

	prev := m.captureLocked()
	m.gradeError = msg
	if err := m.persistLocked(); err != nil {
		m.restoreLocked(prev)
		return fmt.Errorf("session: set grade error: %w", err)
	}
	return nil
}

// checkGradeWriteLocked is the shared guard for grade-outcome writes:
// the session must be ended and token must identify the current attempt
// (empty tokens never match — an idle/reset session has no attempt). The
// caller must hold m.mu.
func (m *Manager) checkGradeWriteLocked(token string) error {
	if m.state != stateEnded {
		return ErrConflict
	}
	if token == "" || token != m.attempt {
		return fmt.Errorf("stale attempt token: %w", ErrConflict)
	}
	return nil
}

// SetAnswer records the candidate's selection for one mcq question:
// selected option indices, stored sorted. An empty (or nil) selection
// deletes the entry — that is what deselecting every option means. It
// returns ErrConflict unless the session is running: answers exist only
// inside a live attempt. On a persist failure nothing changes.
//
// The map is replaced, not mutated, so the capture/restore rollback and
// any snapshot a caller holds stay consistent.
func (m *Manager) SetAnswer(qid string, selected []int) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.state != stateRunning {
		return fmt.Errorf("session: set answer: %w", ErrConflict)
	}

	prev := m.captureLocked()

	next := make(map[string][]int, len(m.answers)+1)
	for k, v := range m.answers {
		next[k] = v
	}
	if len(selected) == 0 {
		delete(next, qid)
	} else {
		sel := make([]int, len(selected))
		copy(sel, selected)
		sort.Ints(sel)
		next[qid] = sel
	}
	if len(next) == 0 {
		next = nil
	}
	m.answers = next

	if err := m.persistLocked(); err != nil {
		m.restoreLocked(prev)
		return fmt.Errorf("session: set answer: %w", err)
	}
	return nil
}

// Answers returns a deep copy of the current attempt's selections, empty
// (never nil) when there are none. It is readable in any state: the
// grader reads it after End, and the review UI after grading.
func (m *Manager) Answers() map[string][]int {
	m.mu.Lock()
	defer m.mu.Unlock()

	out := make(map[string][]int, len(m.answers))
	for k, v := range m.answers {
		sel := make([]int, len(v))
		copy(sel, v)
		out[k] = sel
	}
	return out
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

// mutableFields is the subset of Manager state a transition reads and
// writes. Capturing it before a mutation and restoring it if the
// subsequent persist fails keeps memory and disk from diverging: a
// failed transition leaves no observable trace instead of committing an
// in-memory change the disk never saw.
type mutableFields struct {
	// Included so a Start whose persist fails rolls the attempt's mode
	// and clock back too, not just its state — otherwise a failed
	// training Start would leave an idle session claiming to be untimed.
	mode       string
	attemptDur time.Duration

	state      string
	attempt    string
	startedAt  time.Time
	endedAt    time.Time
	endReason  string
	results    json.RawMessage
	gradeError string
	// The map pointer is enough: answers maps are replaced wholesale,
	// never mutated in place (see the field's comment on Manager).
	answers map[string][]int
}

// captureLocked snapshots the fields a transition may need to roll back.
// The caller must hold m.mu.
func (m *Manager) captureLocked() mutableFields {
	return mutableFields{
		mode:       m.mode,
		attemptDur: m.attemptDur,
		state:      m.state,
		attempt:    m.attempt,
		startedAt:  m.startedAt,
		endedAt:    m.endedAt,
		endReason:  m.endReason,
		results:    m.results,
		gradeError: m.gradeError,
		answers:    m.answers,
	}
}

// restoreLocked reverts the fields captureLocked snapshotted. The caller
// must hold m.mu.
func (m *Manager) restoreLocked(f mutableFields) {
	m.mode = f.mode
	m.attemptDur = f.attemptDur
	m.state = f.state
	m.attempt = f.attempt
	m.startedAt = f.startedAt
	m.endedAt = f.endedAt
	m.endReason = f.endReason
	m.results = f.results
	m.gradeError = f.gradeError
	m.answers = f.answers
}

// untimedLocked reports whether the current attempt has no deadline.
// Training attempts do not, which is the point of them.
func (m *Manager) untimedLocked() bool { return m.attemptDur <= 0 }

// remainingLocked returns the time left until expiry (the attempt's own
// duration since startedAt as measured by clock()), clamped to zero. It
// is meaningless for an untimed attempt — callers must check
// untimedLocked first. The caller must hold m.mu.
func (m *Manager) remainingLocked() time.Duration {
	remaining := m.attemptDur - m.clock().Sub(m.startedAt)
	if remaining < 0 {
		remaining = 0
	}
	return remaining
}

// checkExpiryLocked lazily ends a running session whose time has run
// out, returning whether it actually did so (in which case the caller
// must invoke onExpire after releasing m.mu). It returns false — without
// having changed anything observable — if persisting the transition
// fails, so a transient disk error never reports an expiry that didn't
// durably happen. The caller must hold m.mu.
func (m *Manager) checkExpiryLocked() bool {
	// The untimed guard comes first and is load-bearing: remainingLocked
	// on a zero duration is always 0, so without it every training
	// attempt would be ended by the lazy expiry check on its very first
	// Snapshot.
	if m.state != stateRunning || m.untimedLocked() || m.remainingLocked() > 0 {
		return false
	}
	if err := m.transitionToEndedLocked(reasonExpired); err != nil {
		fmt.Fprintf(os.Stderr, "session: persist expiry: %v\n", err)
		return false
	}
	return true
}

// transitionToEndedLocked moves the session to ended with the given
// reason and persists the change, stopping the armed timer (if any) only
// once the write succeeds. On a persist failure, the in-memory state is
// rolled back to what it was before this call and the timer is left
// untouched — both remain consistent with each other and with the
// caller's error. The caller must hold m.mu.
func (m *Manager) transitionToEndedLocked(reason string) error {
	prev := m.captureLocked()
	m.state = stateEnded
	m.endedAt = m.clock()
	m.endReason = reason
	if err := m.persistLocked(); err != nil {
		m.restoreLocked(prev)
		return err
	}
	m.stopTimerLocked()
	return nil
}

// armTimerLocked (re-)arms the real expiry timer for d, stopping any
// timer already set first so it can't also fire. The caller must hold
// m.mu.
func (m *Manager) armTimerLocked(d time.Duration) {
	m.stopTimerLocked()
	// No deadline means no timer. time.AfterFunc(0, ...) fires almost
	// immediately, so arming a training attempt would end it on the spot
	// — the exact opposite of untimed. A negative d, by contrast, means
	// an attempt resumed after its deadline already passed, and SHOULD
	// fire at once.
	if m.untimedLocked() {
		return
	}
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
	// Idle reports the manager's default duration, because there is no
	// attempt yet and the lobby still needs a number to show. Once an
	// attempt exists, its own clock is the only truthful answer.
	duration := m.dur
	mode := m.mode
	if m.state == stateIdle {
		mode = ""
	} else {
		duration = m.attemptDur
	}
	snap := Snapshot{
		State:           m.state,
		Bank:            m.bank,
		StartedAt:       m.startedAt,
		DurationSeconds: int(duration.Seconds()),
		EndReason:       m.endReason,
		Mode:            mode,
		Untimed:         m.state != stateIdle && m.untimedLocked(),
	}
	if m.state == stateRunning && !m.untimedLocked() {
		snap.RemainingSeconds = int(m.remainingLocked().Seconds())
	}
	return snap
}

// persistLocked atomically writes the current in-memory state to m.path
// (os.CreateTemp in the same directory, then os.Rename). The caller must
// hold m.mu.
func (m *Manager) persistLocked() error {
	doc := persistedState{
		Version:         persistedVersion,
		Bank:            m.bank,
		Attempt:         m.attempt,
		State:           m.state,
		StartedAt:       m.startedAt,
		// The ATTEMPT's duration, not the manager default — this is what
		// a resume reads back, so a training attempt must persist as 0
		// and stay untimed across a restart.
		DurationSeconds: int(m.attemptDur.Seconds()),
		EndReason:       m.endReason,
		Mode:            m.mode,
		Results:         m.results,
		GradeError:      m.gradeError,
		Answers:         m.answers,
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
