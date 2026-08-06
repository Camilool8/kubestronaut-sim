package session

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

type Kind string

const (
	Practical Kind = "practical"
	MCQ       Kind = "mcq"
)

func ParseKind(s string) (Kind, error) {
	switch Kind(s) {
	case Practical, MCQ:
		return Kind(s), nil
	case "":
		return Practical, nil
	}
	return "", fmt.Errorf("session: unknown kind %q (want practical or mcq)", s)
}

type State string

const (
	Pending  State = "pending"
	Starting State = "starting"
	Ready    State = "ready"
	Failed   State = "failed"
)

type Session struct {
	User      string    `json:"-"`
	Kind      Kind      `json:"kind"`
	Bank      string    `json:"bank,omitempty"`
	Pod       string    `json:"pod"`
	State     State     `json:"state"`
	StartedAt time.Time `json:"startedAt"`
	ExpiresAt time.Time `json:"expiresAt"`
	LastSeen  time.Time `json:"lastSeen"`
	Error     string    `json:"error,omitempty"`

	Op string `json:"op,omitempty"`

	addr string
}

func (s Session) Addr() string { return s.addr }

type Pods interface {
	Create(ctx context.Context, spec []byte) error

	Get(ctx context.Context, name string) (Pod, error)
	Delete(ctx context.Context, name string) error
	List(ctx context.Context, selector string) ([]Pod, error)
}

type Pod struct {
	Name        string
	IP          string
	Phase       string
	Ready       bool
	Terminating bool
	CreatedAt   time.Time
	Labels      map[string]string
}

type Flavour struct {
	Seats    int
	Template Template

	Bank string

	BankTemplates map[string]Template
}

func (f Flavour) templateFor(bank string) Template {
	if t, ok := f.BankTemplates[bank]; ok && len(t) > 0 {
		return t
	}
	return f.Template
}

type Config struct {
	Flavours map[Kind]Flavour

	HoldFor time.Duration

	IdleAfter time.Duration

	MaxAge time.Duration

	BootTimeout time.Duration

	BootConcurrency int

	ReadyContainer string

	Port int

	PodPrefix string
	Labels    map[string]string

	Webhook func(user string) (url, token string, err error)

	Now  func() time.Time
	Logf func(string, ...any)
}

func (c *Config) defaults() {
	if c.HoldFor == 0 {
		c.HoldFor = 2 * time.Minute
	}
	if c.IdleAfter == 0 {
		c.IdleAfter = 30 * time.Minute
	}
	if c.MaxAge == 0 {
		c.MaxAge = 10 * time.Hour
	}
	if c.BootTimeout == 0 {
		c.BootTimeout = 20 * time.Minute
	}
	if c.BootConcurrency == 0 {
		c.BootConcurrency = 1
	}
	if c.ReadyContainer == "" {
		c.ReadyContainer = "facilitator"
	}
	if c.Port == 0 {
		c.Port = 8080
	}
	if c.PodPrefix == "" {
		c.PodPrefix = "sim-session"
	}
}

type Queued struct {
	Position int
	Seats    int
	Kind     Kind
}

func (q *Queued) Error() string {
	return fmt.Sprintf("session: all %d %s seats are in use — you are number %d in the queue",
		q.Seats, q.Kind, q.Position)
}

var ErrNoSuchKind = errors.New("session: this deployment does not offer that kind of session")

var ErrNoSession = errors.New("session: no session")

var ErrBusy = errors.New("session: another control operation is in flight")

func KindOf(examType string) Kind {
	if examType == "mcq" {
		return MCQ
	}
	return Practical
}

type Manager struct {
	cfg  Config
	pods Pods

	mu       sync.Mutex
	sessions map[string]*entry
	queues   map[Kind][]*waiter

	boot chan struct{}
}

type entry struct {
	Session
	jobs jobStore

	done chan struct{}
}

type waiter struct {
	user string
	kind Kind

	holdUntil time.Time
	joined    time.Time
}

func New(pods Pods, cfg Config) *Manager {
	cfg.defaults()
	m := &Manager{
		cfg:      cfg,
		pods:     pods,
		sessions: map[string]*entry{},
		queues:   map[Kind][]*waiter{},
		boot:     make(chan struct{}, cfg.BootConcurrency),
	}
	return m
}

func (m *Manager) now() time.Time {
	if m.cfg.Now != nil {
		return m.cfg.Now()
	}
	return time.Now()
}

func (m *Manager) logf(format string, args ...any) {
	if m.cfg.Logf != nil {
		m.cfg.Logf(format, args...)
	}
}

func (m *Manager) Start(ctx context.Context, user string, kind Kind, bank string) (Session, error) {
	m.mu.Lock()

	if e, ok := m.sessions[user]; ok {
		e.LastSeen = m.now()
		s := e.Session
		m.mu.Unlock()
		return s, nil
	}

	fl, ok := m.cfg.Flavours[kind]
	if !ok || fl.Seats <= 0 {
		m.mu.Unlock()
		return Session{}, fmt.Errorf("%w: %s", ErrNoSuchKind, kind)
	}
	if bank == "" {
		bank = fl.Bank
	}

	if m.usedLocked(kind) >= fl.Seats && !m.claimLocked(user, kind) {
		pos := m.enqueueLocked(user, kind)
		m.mu.Unlock()
		return Session{}, &Queued{Position: pos, Seats: fl.Seats, Kind: kind}
	}
	m.dequeueLocked(user)

	now := m.now()
	e := &entry{
		Session: Session{
			User:      user,
			Kind:      kind,
			Bank:      bank,
			Pod:       m.podName(user, kind),
			State:     Pending,
			StartedAt: now,
			LastSeen:  now,
			ExpiresAt: now.Add(m.cfg.MaxAge),
		},
		done: make(chan struct{}),
	}
	e.jobs.now = m.now
	m.sessions[user] = e
	s := e.Session
	m.mu.Unlock()

	m.logf("hub: admitted %s to a %s seat as %s, sitting %s", user, kind, e.Pod, bank)

	go m.bootPod(e, fl)
	return s, nil
}

func (m *Manager) bootPod(e *entry, fl Flavour) {
	select {
	case m.boot <- struct{}{}:
	case <-e.done:
		return
	}
	defer func() { <-m.boot }()

	ctx, cancel := context.WithTimeout(context.Background(), m.cfg.BootTimeout)
	defer cancel()

	go func() {
		select {
		case <-e.done:
			cancel()
		case <-ctx.Done():
		}
	}()

	if err := m.createAndWait(ctx, e, fl); err != nil {
		select {
		case <-e.done:
			return
		default:
		}
		m.logf("hub: %s failed to start: %v", e.Pod, err)
		m.mu.Lock()
		if cur, ok := m.sessions[e.User]; ok && cur == e {
			cur.State, cur.Error = Failed, err.Error()
		}
		m.mu.Unlock()
	}
}

func (m *Manager) createAndWait(ctx context.Context, e *entry, fl Flavour) error {
	p := patch{
		Name:   e.Pod,
		Labels: m.labelsFor(e),
		Bank:   e.Bank,
	}

	if m.cfg.Webhook != nil {
		url, token, err := m.cfg.Webhook(e.User)
		if err != nil {
			return fmt.Errorf("mint a history ticket for %s: %w", e.User, err)
		}
		p.WebhookURL, p.WebhookToken = url, token
	}
	spec, err := fl.templateFor(e.Bank).render(p)
	if err != nil {
		return err
	}

	m.setState(e, Starting, "")
	if err := m.pods.Create(ctx, spec); err != nil {
		if !errors.Is(err, ErrPodExists) {
			return fmt.Errorf("create %s: %w", e.Pod, err)
		}

		m.logf("hub: %s still exists; waiting for it to go", e.Pod)
		if err := m.waitGone(ctx, e); err != nil {
			return err
		}
		if err := m.pods.Create(ctx, spec); err != nil {
			return fmt.Errorf("create %s: %w", e.Pod, err)
		}
	}

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		pod, err := m.pods.Get(ctx, e.Pod)
		switch {
		case err != nil:
			m.logf("hub: %s: %v", e.Pod, err)
		case pod.Phase == "Failed" || pod.Phase == "Succeeded":

			return fmt.Errorf("pod %s is %s", e.Pod, pod.Phase)
		case pod.Ready && pod.IP != "":
			m.mu.Lock()
			e.addr = fmt.Sprintf("%s:%d", pod.IP, m.cfg.Port)
			e.State, e.Error = Ready, ""
			e.LastSeen = m.now()
			m.mu.Unlock()
			m.logf("hub: %s is ready", e.Pod)
			return nil
		}
		select {
		case <-ticker.C:
		case <-ctx.Done():
			return fmt.Errorf("waiting for %s: %w", e.Pod, ctx.Err())
		}
	}
}

func (m *Manager) setState(e *entry, st State, errText string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e.State, e.Error = st, errText
}

func (m *Manager) Get(user string) (Session, error) {
	m.mu.Lock()
	e, ok := m.sessions[user]
	if !ok {
		m.mu.Unlock()
		return Session{}, ErrNoSession
	}
	out := e.Session
	m.mu.Unlock()

	if op := e.jobs.op(); op != "" {
		out.Op = op
		out.addr = ""
	}
	return out, nil
}

func (m *Manager) Touch(user string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if e, ok := m.sessions[user]; ok {
		e.LastSeen = m.now()
	}
}

func (m *Manager) Position(user string) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	for kind := range m.queues {
		for i, w := range m.queues[kind] {
			if w.user == user {
				return i + 1
			}
		}
	}
	return 0
}

func (m *Manager) Seats() map[Kind][2]int {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := map[Kind][2]int{}
	for kind, fl := range m.cfg.Flavours {
		out[kind] = [2]int{m.usedLocked(kind), fl.Seats}
	}
	return out
}

func (m *Manager) End(ctx context.Context, user string) error {
	m.mu.Lock()
	e, ok := m.sessions[user]
	if !ok {
		m.mu.Unlock()
		m.dequeue(user)
		return ErrNoSession
	}
	delete(m.sessions, user)
	close(e.done)
	m.promoteLocked(e.Kind)
	m.mu.Unlock()

	m.logf("hub: ending %s", e.Pod)
	if err := m.pods.Delete(ctx, e.Pod); err != nil && !isGone(err) {
		return fmt.Errorf("session: delete %s: %w", e.Pod, err)
	}
	return nil
}

func (m *Manager) Recycle(user, bank string) (Job, error) {
	m.mu.Lock()
	e, ok := m.sessions[user]
	if !ok {
		m.mu.Unlock()
		return Job{}, ErrNoSession
	}
	fl, haveFlavour := m.cfg.Flavours[e.Kind]
	m.mu.Unlock()
	if !haveFlavour {
		return Job{}, fmt.Errorf("%w: %s", ErrNoSuchKind, e.Kind)
	}
	op, phases := "reset", []Phase{
		{ID: "stop", Label: "Stop the current session"},
		{ID: "start", Label: "Start a clean session"},
		{ID: "verify", Label: "Wait for the exam environment"},
	}
	if bank != "" {
		op = "switch"
		phases[1].Label = "Start a session on the new exam"
	}

	j, ok := e.jobs.begin(op, bank, phases)
	if !ok {
		return Job{}, ErrBusy
	}

	m.mu.Lock()
	e.StartedAt = m.now()
	m.mu.Unlock()

	go m.runRecycle(e, fl, bank)
	return j, nil
}

func (m *Manager) runRecycle(e *entry, fl Flavour, bank string) {
	ctx, cancel := context.WithTimeout(context.Background(), m.cfg.BootTimeout+2*time.Minute)
	defer cancel()

	go func() {
		select {
		case <-e.done:
			cancel()
		case <-ctx.Done():
		}
	}()

	err := func() error {
		e.jobs.enter("stop")
		e.jobs.log("deleting " + e.Pod)
		if err := m.pods.Delete(ctx, e.Pod); err != nil && !isGone(err) {
			return err
		}

		if err := m.waitGone(ctx, e); err != nil {
			return err
		}

		e.jobs.enter("start")
		m.mu.Lock()
		if bank != "" {
			e.Bank = bank
		}

		now := m.now()
		e.LastSeen = now
		e.ExpiresAt = now.Add(m.cfg.MaxAge)
		e.addr, e.State, e.Error = "", Pending, ""
		m.mu.Unlock()

		select {
		case m.boot <- struct{}{}:
		case <-e.done:
			return errors.New("session ended")
		case <-ctx.Done():
			return ctx.Err()
		}
		defer func() { <-m.boot }()

		e.jobs.log("creating " + e.Pod)
		e.jobs.enter("verify")
		return m.createAndWait(ctx, e, fl)
	}()

	if err != nil {
		e.jobs.log("failed: " + err.Error())
		m.mu.Lock()
		e.State, e.Error = Failed, err.Error()
		m.mu.Unlock()
		m.logf("hub: recycle of %s failed: %v", e.Pod, err)
	} else {
		e.jobs.log(e.Pod + " is ready")
	}
	e.jobs.finish(err)
}

func (m *Manager) waitGone(ctx context.Context, e *entry) error {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		_, err := m.pods.Get(ctx, e.Pod)
		if isGone(err) {
			return nil
		}
		e.jobs.detail("waiting for the old session to shut down")
		select {
		case <-ticker.C:
		case <-ctx.Done():
			return fmt.Errorf("waiting for %s to go away: %w", e.Pod, ctx.Err())
		}
	}
}

func (m *Manager) Status(user string) (Snapshot, error) {
	m.mu.Lock()
	e, ok := m.sessions[user]
	m.mu.Unlock()
	if !ok {
		return Snapshot{}, ErrNoSession
	}
	return e.jobs.snapshot(), nil
}

func (m *Manager) Log(user string) (string, []string, error) {
	m.mu.Lock()
	e, ok := m.sessions[user]
	m.mu.Unlock()
	if !ok {
		return "", nil, ErrNoSession
	}
	id, lines := e.jobs.logLines()
	return id, lines, nil
}

func (m *Manager) Reap(ctx context.Context) {
	now := m.now()

	m.mu.Lock()

	for kind, q := range m.queues {
		kept := q[:0]
		for _, w := range q {
			if !w.holdUntil.IsZero() && now.After(w.holdUntil) {
				m.logf("hub: %s did not claim its %s seat in time", w.user, kind)
				continue
			}
			kept = append(kept, w)
		}
		m.queues[kind] = kept
		m.promoteLocked(kind)
	}

	type doomed struct {
		e      *entry
		reason string
	}
	var kill []doomed
	for user, e := range m.sessions {
		switch {
		case now.After(e.ExpiresAt):
			kill = append(kill, doomed{e, "reached the maximum session length"})
		case now.Sub(e.LastSeen) > m.cfg.IdleAfter:
			kill = append(kill, doomed{e, "was idle"})
		default:
			continue
		}
		delete(m.sessions, user)
		close(e.done)
	}
	for _, d := range kill {
		m.promoteLocked(d.e.Kind)
	}

	live := make([]*entry, 0, len(m.sessions))
	for _, e := range m.sessions {
		live = append(live, e)
	}
	m.mu.Unlock()

	for _, d := range kill {
		m.logf("hub: reaping %s: it %s", d.e.Pod, d.reason)
		if err := m.pods.Delete(ctx, d.e.Pod); err != nil && !isGone(err) {
			m.logf("hub: delete %s: %v", d.e.Pod, err)
		}
	}

	for _, e := range live {
		m.mu.Lock()
		st, booting := e.State, e.State == Pending || e.State == Starting
		m.mu.Unlock()
		if booting {
			continue
		}
		pod, err := m.pods.Get(ctx, e.Pod)
		if isGone(err) || (err == nil && pod.Terminating) {
			m.logf("hub: %s disappeared; freeing the seat", e.Pod)
			m.mu.Lock()
			if cur, ok := m.sessions[e.User]; ok && cur == e {
				delete(m.sessions, e.User)
				close(e.done)
				m.promoteLocked(e.Kind)
			}
			m.mu.Unlock()
			continue
		}
		if err == nil && st == Ready && !pod.Ready {
			m.setState(e, Starting, "")
		}
	}
}

func (m *Manager) Adopt(ctx context.Context) error {
	pods, err := m.pods.List(ctx, m.selector())
	if err != nil {
		return fmt.Errorf("session: list existing sessions: %w", err)
	}
	now := m.now()
	adopted := 0
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, pod := range pods {
		user := pod.Labels["kubestronaut-sim/user"]
		kind := Kind(pod.Labels["kubestronaut-sim/kind"])
		if user == "" || pod.Terminating {
			continue
		}
		if _, taken := m.sessions[user]; taken {
			continue
		}
		started := pod.CreatedAt
		if started.IsZero() {
			started = now
		}
		e := &entry{
			Session: Session{
				User: user, Kind: kind, Bank: pod.Labels["kubestronaut-sim/bank"],
				Pod: pod.Name, StartedAt: started, LastSeen: now,
				ExpiresAt: started.Add(m.cfg.MaxAge),
				State:     Starting,
			},
			done: make(chan struct{}),
		}
		e.jobs.now = m.now
		if pod.Ready && pod.IP != "" {
			e.State = Ready
			e.addr = fmt.Sprintf("%s:%d", pod.IP, m.cfg.Port)
		}
		m.sessions[user] = e
		adopted++
	}
	if adopted > 0 {
		m.logf("hub: adopted %d session(s) already running", adopted)
	}
	return nil
}

func (m *Manager) Run(ctx context.Context, every time.Duration) {
	if every <= 0 {
		every = 30 * time.Second
	}
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			m.Reap(ctx)
		}
	}
}

func (m *Manager) usedLocked(kind Kind) int {
	n := 0
	for _, e := range m.sessions {
		if e.Kind == kind {
			n++
		}
	}
	for _, w := range m.queues[kind] {
		if !w.holdUntil.IsZero() {
			n++
		}
	}
	return n
}

func (m *Manager) claimLocked(user string, kind Kind) bool {
	for _, w := range m.queues[kind] {
		if w.user == user && !w.holdUntil.IsZero() && !m.now().After(w.holdUntil) {
			return true
		}
	}
	return false
}

func (m *Manager) enqueueLocked(user string, kind Kind) int {
	for i, w := range m.queues[kind] {
		if w.user == user {
			return i + 1
		}
	}
	m.queues[kind] = append(m.queues[kind], &waiter{user: user, kind: kind, joined: m.now()})

	sort.SliceStable(m.queues[kind], func(i, j int) bool {
		return m.queues[kind][i].joined.Before(m.queues[kind][j].joined)
	})
	m.promoteLocked(kind)
	return len(m.queues[kind])
}

func (m *Manager) dequeueLocked(user string) {
	for kind, q := range m.queues {
		for i, w := range q {
			if w.user == user {
				m.queues[kind] = append(q[:i], q[i+1:]...)
				break
			}
		}
	}
}

func (m *Manager) dequeue(user string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.dequeueLocked(user)
}

func (m *Manager) promoteLocked(kind Kind) {
	fl, ok := m.cfg.Flavours[kind]
	if !ok {
		return
	}
	q := m.queues[kind]
	for i := 0; i < len(q) && m.usedLocked(kind) < fl.Seats; i++ {
		if q[i].holdUntil.IsZero() {
			q[i].holdUntil = m.now().Add(m.cfg.HoldFor)
			m.logf("hub: %s may claim a %s seat within %s", q[i].user, kind, m.cfg.HoldFor)
		}
	}
}

func (m *Manager) labelsFor(e *entry) map[string]string {
	out := map[string]string{}
	for k, v := range m.cfg.Labels {
		out[k] = v
	}
	out["kubestronaut-sim/user"] = e.User
	out["kubestronaut-sim/kind"] = string(e.Kind)
	if e.Bank != "" {
		out["kubestronaut-sim/bank"] = e.Bank
	}
	return out
}

func (m *Manager) selector() string {

	return "kubestronaut-sim/user"
}

func (m *Manager) podName(user string, kind Kind) string {
	return fmt.Sprintf("%s-%s-%s", m.cfg.PodPrefix, kind, podNameSafe(user))
}

func isGone(err error) bool {
	return err != nil && errors.Is(err, ErrPodGone)
}

var (
	ErrPodGone   = errors.New("session: pod does not exist")
	ErrPodExists = errors.New("session: pod already exists")
)

func podNameSafe(s string) string {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '-':
			out = append(out, r)
		case r >= 'A' && r <= 'Z':
			out = append(out, r+('a'-'A'))
		default:
			out = append(out, '-')
		}
	}

	s = strings.Trim(string(out), "-")
	if s == "" {
		s = "anon"
	}
	if len(s) > 40 {
		s = strings.TrimRight(s[:40], "-")
	}
	return s
}
