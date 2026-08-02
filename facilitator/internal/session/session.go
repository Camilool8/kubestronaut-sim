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

// Modes lists every mode a candidate may choose, in the order the mode
// screen offers them: gentlest first, the real thing last.
func Modes() []string {
	return []string{ModeTraining, ModeSpeed, ModeExam}
}

// The three predicates below are the single definition of what a mode
// permits. The HTTP layer both DESCRIBES a mode with them (the cards on
// the mode screen are generated from these) and ENFORCES with them, so a
// card cannot advertise something the server then refuses.
//
// Two of them return the same answer today. They are kept apart because
// they are separate promises — a future mode could grade as you go
// without handing over the reference solution — and collapsing them now
// would hide that the day it stops being true.

// HelpAllowed reports whether mode may read hints and reference
// solutions while its attempt is still running.
func HelpAllowed(mode string) bool { return mode == ModeTraining }

// GradesPerTask reports whether mode may score the work so far without
// ending the attempt. In an exam, learning your score mid-attempt is
// precisely what the format withholds.
func GradesPerTask(mode string) bool { return mode == ModeTraining }

// Recorded reports whether an attempt in mode belongs in the durable
// attempt history. Training is deliberate practice rather than a
// sitting: counting it would make every "best score" meaningless.
func Recorded(mode string) bool { return mode != ModeTraining }

// Recommended names the one mode the mode screen accents. Speed sits
// between the other two — real conditions, a harder clock — which is the
// most useful default for someone practising rather than rehearsing.
func Recommended(mode string) bool { return mode == ModeSpeed }

// FocusGapCap bounds how much time a single gap between focus reports
// can contribute to a question.
//
// The client reports which task is on screen every poll interval, so a
// normal gap is ten seconds. A candidate who closes the tab overnight
// produces a gap of nine hours, and billing it would turn "time on this
// question" into "time between two page loads". Ninety seconds is
// generous for a missed report or two and useless as a way to accrue a
// figure nobody was present for.
const FocusGapCap = 90 * time.Second

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

	// draw is the attempt's drawn question set and the parameters that
	// produced it — set once at StartDraw and immutable for the attempt's
	// life, exactly like mode and attemptDur above. Its QuestionIDs is
	// empty for an attempt started via plain Start: "no subset" means
	// "the whole bank", the pre-pooling behaviour every existing bank
	// still gets by default.
	draw Draw

	// timeSpent is qid → seconds the question has been on screen,
	// accrued between Focus reports. Never mutated in place: every
	// accrual replaces the whole map, so captureLocked/restoreLocked
	// rollback stays correct with a plain pointer copy.
	timeSpent map[string]int
	// focusQID and focusSince are the open interval — which question was
	// last reported on screen, and when. Deliberately NOT persisted: a
	// restart should not bill the downtime to whatever was open when the
	// process went away. The next report simply opens a fresh interval.
	focusQID   string
	focusSince time.Time
}

// Draw is an attempt's question set and the parameters that produced it.
// A seed only reproduces a draw within one pool, so PoolDigest travels
// beside Seed rather than being re-derived later from a bank that may by
// then be a different bank.
type Draw struct {
	// QuestionIDs is the drawn subset in attempt order. Empty means "no
	// subset was drawn" — the whole bank.
	QuestionIDs []string
	// Seed is the six-hex-digit seed the draw came out of.
	Seed string
	// PoolDigest fingerprints the pool the draw ran against.
	PoolDigest string
	// DomainFilter is the curriculum domains the draw was narrowed to,
	// empty for a whole-curriculum attempt.
	DomainFilter []string
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
	// ElapsedSeconds is how long this attempt has been running (or ran,
	// once it has ended), measured by the same clock as everything else
	// here. It exists because DurationSeconds - RemainingSeconds is the
	// elapsed time of a TIMED attempt only: an untimed training attempt
	// reports both as 0, and there is no other way to say how long it has
	// been going. 0 when idle.
	ElapsedSeconds int
	// Seed, PoolDigest and DomainFilter describe how this attempt's
	// questions were drawn. All empty when idle, and on an attempt
	// started before seeding existed.
	Seed         string
	PoolDigest   string
	DomainFilter []string
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
	// QuestionIDs is the attempt's drawn subset, in draw order; absent
	// for an attempt started via plain Start, which draws no subset.
	QuestionIDs []string `json:"questionIds,omitempty"`
	// Seed, PoolDigest and DomainFilter are the draw's parameters,
	// persisted so a resumed attempt can still say how it was drawn — and
	// so grading can refuse when PoolDigest no longer describes the
	// loaded bank (exam.CheckPool).
	Seed         string   `json:"seed,omitempty"`
	PoolDigest   string   `json:"poolDigest,omitempty"`
	DomainFilter []string `json:"domainFilter,omitempty"`
	// TimeSpent is qid → seconds accrued between focus reports. The OPEN
	// interval is not part of it: focusSince is not persisted, so a
	// restart bills nothing for the time the process was away.
	TimeSpent map[string]int `json:"timeSpent,omitempty"`
}

// persistedVersion is the on-disk format this build reads and writes.
// Version 1 files predate bank identity and attempt tokens; version 2
// predates attempt modes; version 3 predates mcq answer storage; version
// 4 predates a pooled mcq attempt's drawn question-id subset; version 5
// predates the draw's seed, pool digest and domain filter, and per-
// question focus time. All are discarded on load by the existing version
// guard, which is the whole migration: a discarded file starts the
// session idle, and an idle session has nothing to migrate.
//
// A bump costs whoever is mid-attempt their attempt, so the seed, the
// digest, the domain filter and the focus accrual all arrived in this
// one bump rather than in the two or three the work naturally split
// into. Note that it does not cost anyone a graded RESULT: results are
// stored as opaque json.RawMessage and served back verbatim (see the
// Results field above), so a result from a build before any of these
// fields existed survives every bump and arrives at the client with none
// of them. Nothing downstream may assume otherwise.
const persistedVersion = 6

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
	m.draw = Draw{
		QuestionIDs:  doc.QuestionIDs,
		Seed:         doc.Seed,
		PoolDigest:   doc.PoolDigest,
		DomainFilter: doc.DomainFilter,
	}
	m.timeSpent = doc.TimeSpent
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
	return m.StartDraw(mode, dur, Draw{})
}

// StartDraw is Start plus the attempt's drawn question set, persisted so
// a resume (or a facilitator restart) shows the exact same questions in
// the exact same order — and so the attempt can still say which seed,
// pool and domain filter produced them. A zero Draw is what plain Start
// passes: no subset, which means the whole bank.
func (m *Manager) StartDraw(mode string, dur time.Duration, draw Draw) (Snapshot, error) {
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
	m.draw = cloneDraw(draw)
	m.timeSpent = nil
	m.focusQID = ""
	m.focusSince = time.Time{}

	if err := m.persistLocked(); err != nil {
		m.restoreLocked(prev)
		return Snapshot{}, fmt.Errorf("session: start: %w", err)
	}
	m.armTimerLocked(m.attemptDur)

	return m.snapshotLocked(), nil
}

// cloneDraw deep-copies d's slices so the caller cannot mutate an
// attempt's record of itself after the fact. An empty QuestionIDs
// normalizes to nil: "no subset" and "a subset of nothing" must not be
// two different persisted states.
func cloneDraw(d Draw) Draw {
	out := Draw{Seed: d.Seed, PoolDigest: d.PoolDigest}
	if len(d.QuestionIDs) > 0 {
		out.QuestionIDs = append([]string(nil), d.QuestionIDs...)
	}
	if len(d.DomainFilter) > 0 {
		out.DomainFilter = append([]string(nil), d.DomainFilter...)
	}
	return out
}

// QuestionIDs returns a copy of the current attempt's drawn subset, in
// draw order — empty (never nil) when there is none (an attempt started
// via plain Start, or no attempt at all).
func (m *Manager) QuestionIDs() []string {
	m.mu.Lock()
	defer m.mu.Unlock()

	out := make([]string, len(m.draw.QuestionIDs))
	copy(out, m.draw.QuestionIDs)
	return out
}

// Focus records that question qid is now the one on screen, accruing the
// time since the previous report to whatever was on screen before it.
//
// The client reports a question id and nothing else; the server owns the
// clock here exactly as it owns the countdown, so a client cannot
// inflate (or a slow one under-report) how long it spent anywhere. A gap
// contributes at most FocusGapCap however long it really was.
//
// Re-reporting the SAME question is the normal case — the poller repeats
// the current one every interval — and is how time accumulates.
// ErrConflict unless an attempt is running: time can only be spent
// inside one.
func (m *Manager) Focus(qid string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.state != stateRunning {
		return fmt.Errorf("session: focus: %w", ErrConflict)
	}

	prev := m.captureLocked()
	m.accrueFocusLocked()
	m.focusQID = qid
	m.focusSince = m.clock()

	if err := m.persistLocked(); err != nil {
		m.restoreLocked(prev)
		return fmt.Errorf("session: focus: %w", err)
	}
	return nil
}

// accrueFocusLocked closes the open focus interval, adding its capped
// duration to the question it belongs to and leaving no interval open.
// The caller must hold m.mu.
func (m *Manager) accrueFocusLocked() {
	if m.focusQID == "" || m.focusSince.IsZero() {
		return
	}
	qid := m.focusQID
	gap := m.clock().Sub(m.focusSince)
	if gap > FocusGapCap {
		gap = FocusGapCap
	}
	m.focusQID, m.focusSince = "", time.Time{}

	secs := int(gap.Seconds())
	if secs <= 0 {
		return
	}
	// Replaced, never mutated in place, so a captureLocked taken before
	// this call still restores the pre-accrual map (see the field's
	// comment on Manager).
	next := make(map[string]int, len(m.timeSpent)+1)
	for k, v := range m.timeSpent {
		next[k] = v
	}
	next[qid] += secs
	m.timeSpent = next
}

// TimeSpent returns a copy of the per-question accrual, qid → seconds.
// The open interval is not included: it is credited when the next focus
// report arrives, or when the attempt ends.
func (m *Manager) TimeSpent() map[string]int {
	m.mu.Lock()
	defer m.mu.Unlock()

	out := make(map[string]int, len(m.timeSpent))
	for k, v := range m.timeSpent {
		out[k] = v
	}
	return out
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
	m.draw = Draw{}
	m.timeSpent = nil
	m.focusQID = ""
	m.focusSince = time.Time{}

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
	// Likewise: the draw's slices are replaced wholesale (set once at
	// StartDraw, cleared at Reset) and timeSpent is rebuilt on every
	// accrual, never mutated in place.
	draw       Draw
	timeSpent  map[string]int
	focusQID   string
	focusSince time.Time
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
		draw:       m.draw,
		timeSpent:  m.timeSpent,
		focusQID:   m.focusQID,
		focusSince: m.focusSince,
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
	m.draw = f.draw
	m.timeSpent = f.timeSpent
	m.focusQID = f.focusQID
	m.focusSince = f.focusSince
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
	// Close the open focus interval before the attempt is over: without
	// this the last question a candidate looked at loses everything since
	// its final report, which on a question they submitted from is the
	// only interval it ever had.
	m.accrueFocusLocked()
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
		ElapsedSeconds:  int(m.elapsedLocked().Seconds()),
		Seed:            m.draw.Seed,
		PoolDigest:      m.draw.PoolDigest,
	}
	if len(m.draw.DomainFilter) > 0 {
		snap.DomainFilter = append([]string(nil), m.draw.DomainFilter...)
	}
	if m.state == stateRunning && !m.untimedLocked() {
		snap.RemainingSeconds = int(m.remainingLocked().Seconds())
	}
	return snap
}

// elapsedLocked returns how long the attempt has been running, or ran:
// clock() since startedAt while running, endedAt since startedAt once it
// has ended, and zero when idle. Unlike remainingLocked it is meaningful
// for an untimed attempt, which is the entire reason it exists — a
// training attempt's duration and remaining are both 0, so their
// difference says nothing. The caller must hold m.mu.
func (m *Manager) elapsedLocked() time.Duration {
	if m.state == stateIdle || m.startedAt.IsZero() {
		return 0
	}
	end := m.clock()
	if m.state == stateEnded && !m.endedAt.IsZero() {
		end = m.endedAt
	}
	elapsed := end.Sub(m.startedAt)
	if elapsed < 0 {
		return 0
	}
	return elapsed
}

// persistLocked atomically writes the current in-memory state to m.path
// (os.CreateTemp in the same directory, then os.Rename). The caller must
// hold m.mu.
func (m *Manager) persistLocked() error {
	doc := persistedState{
		Version:   persistedVersion,
		Bank:      m.bank,
		Attempt:   m.attempt,
		State:     m.state,
		StartedAt: m.startedAt,
		// The ATTEMPT's duration, not the manager default — this is what
		// a resume reads back, so a training attempt must persist as 0
		// and stay untimed across a restart.
		DurationSeconds: int(m.attemptDur.Seconds()),
		EndReason:       m.endReason,
		Mode:            m.mode,
		Results:         m.results,
		GradeError:      m.gradeError,
		Answers:         m.answers,
		QuestionIDs:     m.draw.QuestionIDs,
		Seed:            m.draw.Seed,
		PoolDigest:      m.draw.PoolDigest,
		DomainFilter:    m.draw.DomainFilter,
		TimeSpent:       m.timeSpent,
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
