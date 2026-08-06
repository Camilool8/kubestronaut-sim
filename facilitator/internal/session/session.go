package session

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

const (
	stateIdle    = "idle"
	stateRunning = "running"
	stateEnded   = "ended"
)

const (
	ModeExam     = "exam"
	ModeTraining = "training"
	ModeSpeed    = "speed"
)

func ValidMode(s string) bool {
	return s == ModeExam || s == ModeTraining || s == ModeSpeed
}

func Modes() []string {
	return []string{ModeTraining, ModeSpeed, ModeExam}
}

func HelpAllowed(mode string) bool { return mode == ModeTraining }

func GradesPerTask(mode string) bool { return mode == ModeTraining }

func Recorded(mode string) bool { return mode != ModeTraining }

func Recommended(mode string) bool { return mode == ModeSpeed }

const FocusGapCap = 90 * time.Second

const reasonExpired = "expired"

var ErrConflict = errors.New("session: invalid state transition")

type Manager struct {
	mu       sync.Mutex
	path     string
	bank     string
	dur      time.Duration
	clock    func() time.Time
	onExpire func()
	timer    *time.Timer

	mode       string
	attemptDur time.Duration

	state      string
	attempt    string
	startedAt  time.Time
	endedAt    time.Time
	endReason  string
	results    json.RawMessage
	gradeError string

	answers map[string][]int

	draw Draw

	timeSpent map[string]int

	focusQID   string
	focusSince time.Time
}

type Draw struct {
	QuestionIDs []string

	Seed string

	PoolDigest string

	DomainFilter []string
}

type Snapshot struct {
	State            string
	Bank             string
	StartedAt        time.Time
	DurationSeconds  int
	RemainingSeconds int
	EndReason        string
	Mode             string

	Untimed bool

	ElapsedSeconds int

	Seed         string
	PoolDigest   string
	DomainFilter []string
}

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

	Answers map[string][]int `json:"answers,omitempty"`

	QuestionIDs []string `json:"questionIds,omitempty"`

	Seed         string   `json:"seed,omitempty"`
	PoolDigest   string   `json:"poolDigest,omitempty"`
	DomainFilter []string `json:"domainFilter,omitempty"`

	TimeSpent map[string]int `json:"timeSpent,omitempty"`
}

const persistedVersion = 6

func DrawnIDs(path string) ([]string, error) {
	raw, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var doc persistedState
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("session: parse %s: %w", path, err)
	}
	if doc.State == stateIdle {
		return nil, nil
	}
	return append([]string(nil), doc.QuestionIDs...), nil
}

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

		case m.remainingLocked() <= 0:
			if err := m.transitionToEndedLocked(reasonExpired); err != nil {

				fmt.Fprintf(os.Stderr, "session: persist expiry on load %s: %v\n", path, err)
			}
		default:
			m.armTimerLocked(m.remainingLocked())
		}
	}

	return m, nil
}

func (m *Manager) Start(mode string, dur time.Duration) (Snapshot, error) {
	return m.StartDraw(mode, dur, Draw{})
}

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

func (m *Manager) QuestionIDs() []string {
	m.mu.Lock()
	defer m.mu.Unlock()

	out := make([]string, len(m.draw.QuestionIDs))
	copy(out, m.draw.QuestionIDs)
	return out
}

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

	next := make(map[string]int, len(m.timeSpent)+1)
	for k, v := range m.timeSpent {
		next[k] = v
	}
	next[qid] += secs
	m.timeSpent = next
}

func (m *Manager) TimeSpent() map[string]int {
	m.mu.Lock()
	defer m.mu.Unlock()

	out := make(map[string]int, len(m.timeSpent))
	for k, v := range m.timeSpent {
		out[k] = v
	}
	return out
}

func newAttemptToken() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {

		return fmt.Sprintf("t-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b[:])
}

func (m *Manager) AttemptToken() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.attempt
}

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

func (m *Manager) checkGradeWriteLocked(token string) error {
	if m.state != stateEnded {
		return ErrConflict
	}
	if token == "" || token != m.attempt {
		return fmt.Errorf("stale attempt token: %w", ErrConflict)
	}
	return nil
}

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

func (m *Manager) Results() (results json.RawMessage, gradeError string, graded bool) {
	m.mu.Lock()
	defer m.mu.Unlock()

	graded = len(m.results) > 0 || m.gradeError != ""
	return m.results, m.gradeError, graded
}

type mutableFields struct {
	mode       string
	attemptDur time.Duration

	state      string
	attempt    string
	startedAt  time.Time
	endedAt    time.Time
	endReason  string
	results    json.RawMessage
	gradeError string

	answers map[string][]int

	draw       Draw
	timeSpent  map[string]int
	focusQID   string
	focusSince time.Time
}

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

func (m *Manager) untimedLocked() bool { return m.attemptDur <= 0 }

func (m *Manager) remainingLocked() time.Duration {
	remaining := m.attemptDur - m.clock().Sub(m.startedAt)
	if remaining < 0 {
		remaining = 0
	}
	return remaining
}

func (m *Manager) checkExpiryLocked() bool {

	if m.state != stateRunning || m.untimedLocked() || m.remainingLocked() > 0 {
		return false
	}
	if err := m.transitionToEndedLocked(reasonExpired); err != nil {
		fmt.Fprintf(os.Stderr, "session: persist expiry: %v\n", err)
		return false
	}
	return true
}

func (m *Manager) transitionToEndedLocked(reason string) error {
	prev := m.captureLocked()
	m.state = stateEnded
	m.endedAt = m.clock()
	m.endReason = reason

	m.accrueFocusLocked()
	if err := m.persistLocked(); err != nil {
		m.restoreLocked(prev)
		return err
	}
	m.stopTimerLocked()
	return nil
}

func (m *Manager) armTimerLocked(d time.Duration) {
	m.stopTimerLocked()

	if m.untimedLocked() {
		return
	}
	if d < 0 {
		d = 0
	}
	m.timer = time.AfterFunc(d, m.onTimerFire)
}

func (m *Manager) stopTimerLocked() {
	if m.timer != nil {
		m.timer.Stop()
		m.timer = nil
	}
}

func (m *Manager) onTimerFire() {
	m.mu.Lock()
	expired := m.checkExpiryLocked()
	m.mu.Unlock()

	if expired && m.onExpire != nil {
		m.onExpire()
	}
}

func (m *Manager) snapshotLocked() Snapshot {

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

func (m *Manager) persistLocked() error {
	doc := persistedState{
		Version:   persistedVersion,
		Bank:      m.bank,
		Attempt:   m.attempt,
		State:     m.state,
		StartedAt: m.startedAt,

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
