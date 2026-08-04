// Package session owns the scarce thing: a running exam Pod.
//
// The hosted tier is capped, so the interesting logic is not "start a
// Pod" but "decide who may". Three rules shape it:
//
//   - A seat is held from admission to teardown, not from readiness.
//     Counting only ready sessions would admit a second candidate while
//     the first is still booting and hand both of them a half-built
//     cluster.
//
//   - Pod creation is serialised. Boot is CPU-bound — one booting session
//     measured 3090m of a 4-core node's 4000m while memory stayed at 25%
//     — so two simultaneous boots on one node do not take turns, they
//     both crawl. This is a throughput decision, not a politeness one.
//
//   - The queue hands the head a time-boxed hold rather than a seat.
//     A browser that closed an hour ago must not keep a seat warm, and
//     the only evidence that someone is still waiting is that they are
//     still asking.
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

// Kind is a session flavour. They are separate pools because they are
// separate costs: a practical session is a privileged Pod building a
// two-node cluster, an MCQ session is a facilitator and 128Mi.
type Kind string

const (
	Practical Kind = "practical"
	MCQ       Kind = "mcq"
)

// ParseKind validates a requested flavour.
func ParseKind(s string) (Kind, error) {
	switch Kind(s) {
	case Practical, MCQ:
		return Kind(s), nil
	case "":
		return Practical, nil
	}
	return "", fmt.Errorf("session: unknown kind %q (want practical or mcq)", s)
}

// State is where a session is in its life.
type State string

const (
	// Pending: seat held, waiting for a boot slot. Distinct from Starting
	// because the difference matters to the person waiting — nothing is
	// wrong, someone else is booting.
	Pending State = "pending"
	// Starting: the Pod exists and is not ready yet.
	Starting State = "starting"
	Ready    State = "ready"
	// Failed: the seat is still held so the candidate can read why
	// before it is reaped.
	Failed State = "failed"
)

// Session is one candidate's Pod, as the rest of the hub sees it.
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

	// addr is where the proxy sends traffic. Unexported: it is the
	// candidate's own Pod, but publishing an in-cluster address in a JSON
	// response is telling every user something about the infrastructure
	// that they have no use for.
	addr string
}

// Addr is the host:port the proxy should dial, empty until ready.
func (s Session) Addr() string { return s.addr }

// Pods is what the manager needs from Kubernetes, and no more.
//
// An interface rather than *kube.Client so the manager's rules — seats,
// queue, holds, reaping — are testable without an API server, and so a
// laptop can run the hub against `./sim up` through Static.
type Pods interface {
	// Create returns ErrPodExists if the name is taken.
	Create(ctx context.Context, spec []byte) error
	// Get and Delete return ErrPodGone for a Pod that is not there.
	Get(ctx context.Context, name string) (Pod, error)
	Delete(ctx context.Context, name string) error
	List(ctx context.Context, selector string) ([]Pod, error)
}

// Pod is the manager's view of a running Pod.
type Pod struct {
	Name        string
	IP          string
	Phase       string
	Ready       bool
	Terminating bool
	CreatedAt   time.Time
	Labels      map[string]string
}

// Flavour is the per-kind configuration: how many may run at once, and
// what to run.
type Flavour struct {
	Seats    int
	Template Template
	// Bank is the exam this flavour starts on. Empty leaves whatever the
	// template declares.
	Bank string
}

// Config is everything the manager needs to be built.
type Config struct {
	Flavours map[Kind]Flavour

	// HoldFor is how long the head of the queue keeps its claim.
	HoldFor time.Duration
	// IdleAfter ends a session nobody has touched. The proxy touches on
	// every request, so this measures a closed tab, not a quiet think.
	IdleAfter time.Duration
	// MaxAge is the hard cap. A real CKAD sitting is two hours.
	MaxAge time.Duration
	// BootTimeout gives up on a Pod that never becomes ready.
	BootTimeout time.Duration
	// BootConcurrency is how many Pods may boot at once. See the package
	// comment: this defaults to 1 deliberately.
	BootConcurrency int

	// ReadyContainer is the container whose readiness means "usable".
	ReadyContainer string
	// Port is the port on that container the hub proxies to.
	Port int

	// PodPrefix names Pods, and the label selector adopts them.
	PodPrefix string
	Labels    map[string]string

	// Webhook mints the endpoint and the ticket a session Pod posts its
	// graded attempts back with, for one user. Nil means nothing is
	// collecting them and the Pod keeps only its own ephemeral history —
	// which is what a self-hoster running this without the store gets,
	// and what every test that does not care gets.
	//
	// Minted per Pod rather than once at boot because the ticket names
	// the user: it is the Pod's only way to say whose attempt this is,
	// and it must not be able to say anyone else's.
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

// Queued is returned by Start when every seat is taken. It is an error
// because the caller cannot proceed, and it carries a position because
// "try later" without a place in line is what makes people refresh.
type Queued struct {
	Position int
	Seats    int
	Kind     Kind
}

func (q *Queued) Error() string {
	return fmt.Sprintf("session: all %d %s seats are in use — you are number %d in the queue",
		q.Seats, q.Kind, q.Position)
}

// ErrNoSuchKind is a request for a flavour this deployment does not
// offer — an MCQ-only hub, say, or a practical-only one.
var ErrNoSuchKind = errors.New("session: this deployment does not offer that kind of session")

// ErrNoSession is asking about a session that does not exist.
var ErrNoSession = errors.New("session: no session")

// ErrBusy is a second control operation while one is in flight.
var ErrBusy = errors.New("session: another control operation is in flight")

// Manager is the whole hosted tier's admission control.
type Manager struct {
	cfg  Config
	pods Pods

	mu       sync.Mutex
	sessions map[string]*entry
	queues   map[Kind][]*waiter

	// boot is the serialising semaphore. Capacity, not a mutex, because
	// BootConcurrency is a value an operator with more nodes will raise.
	boot chan struct{}
}

// entry is a session plus the machinery that is nobody else's business.
type entry struct {
	Session
	jobs jobStore
	// done is closed when the session ends, so a boot that is minutes
	// into polling stops rather than resurrecting a session the
	// candidate already left.
	done chan struct{}
}

type waiter struct {
	user string
	kind Kind
	// holdUntil is zero until this waiter reaches the head and a seat
	// frees. From then the seat is theirs to claim until it lapses.
	holdUntil time.Time
	joined    time.Time
}

// New builds a Manager. It does not touch the cluster; call Adopt for
// that.
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

// Start admits a user, or tells them where they are in the queue.
//
// Idempotent: a user who already has a session gets it back rather than a
// second one. The UI polls this while queued, and each poll is also how a
// held seat is claimed.
func (m *Manager) Start(ctx context.Context, user string, kind Kind) (Session, error) {
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

	// A seat this user is already holding through the queue counts as
	// theirs; anyone else's hold counts against them.
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
			Bank:      fl.Bank,
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

	m.logf("hub: admitted %s to a %s seat as %s", user, kind, e.Pod)
	// Detached from the request: booting takes minutes and the browser
	// polls. ctx here would cancel the boot when the admitting request
	// returned.
	go m.bootPod(e, fl)
	return s, nil
}

// bootPod claims a boot slot, creates the Pod and waits for it.
func (m *Manager) bootPod(e *entry, fl Flavour) {
	select {
	case m.boot <- struct{}{}:
	case <-e.done:
		return
	}
	defer func() { <-m.boot }()

	ctx, cancel := context.WithTimeout(context.Background(), m.cfg.BootTimeout)
	defer cancel()
	// A session ended mid-boot must abandon the boot, not finish it.
	go func() {
		select {
		case <-e.done:
			cancel()
		case <-ctx.Done():
		}
	}()

	if err := m.createAndWait(ctx, e, fl); err != nil {
		select {
		case <-e.done: // ended on purpose; not a failure to report
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

// createAndWait is the boot itself, shared by first start and recycle.
func (m *Manager) createAndWait(ctx context.Context, e *entry, fl Flavour) error {
	p := patch{
		Name:   e.Pod,
		Labels: m.labelsFor(e),
		Bank:   e.Bank,
	}
	// Minted here rather than when the session was admitted, so a
	// recycle gets a fresh ticket: the replacement Pod may outlive the
	// window the original one's was good for.
	if m.cfg.Webhook != nil {
		url, token, err := m.cfg.Webhook(e.User)
		if err != nil {
			return fmt.Errorf("mint a history ticket for %s: %w", e.User, err)
		}
		p.WebhookURL, p.WebhookToken = url, token
	}
	spec, err := fl.Template.render(p)
	if err != nil {
		return err
	}

	m.setState(e, Starting, "")
	if err := m.pods.Create(ctx, spec); err != nil {
		if !errors.Is(err, ErrPodExists) {
			return fmt.Errorf("create %s: %w", e.Pod, err)
		}
		// Reachable, and not a corner case: a reaped session deletes its
		// Pod, the candidate presses start again, and a Pod still inside
		// its 30s grace period owns the name. Waiting for the name is the
		// whole fix; adopting the old Pod would hand them a cluster from
		// the session they just lost.
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
			// restartPolicy: Never, so a container exiting is terminal.
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

// Get returns a user's session.
func (m *Manager) Get(user string) (Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.sessions[user]
	if !ok {
		return Session{}, ErrNoSession
	}
	return e.Session, nil
}

// Touch records that a user is still there. Called on every proxied
// request, so it must stay cheap.
func (m *Manager) Touch(user string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if e, ok := m.sessions[user]; ok {
		e.LastSeen = m.now()
	}
}

// Position reports where a user stands in the queue, 0 if they are not
// in one.
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

// Seats reports usage for the UI: how many of each flavour are taken.
func (m *Manager) Seats() map[Kind][2]int {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := map[Kind][2]int{}
	for kind, fl := range m.cfg.Flavours {
		out[kind] = [2]int{m.usedLocked(kind), fl.Seats}
	}
	return out
}

// End tears a session down and frees its seat.
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

// Recycle is what a hosted reset or switch actually is: the Pod is
// replaced. bank empty means reset (same exam, clean cluster); a bank
// means switch.
//
// It returns as soon as the job is accepted, in the conductor's 202
// shape, and the work continues in the background where the UI polls it.
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

	go m.runRecycle(e, fl, bank)
	return j, nil
}

func (m *Manager) runRecycle(e *entry, fl Flavour, bank string) {
	ctx, cancel := context.WithTimeout(context.Background(), m.cfg.BootTimeout+2*time.Minute)
	defer cancel()
	// Same watcher as a first boot: a reset the candidate abandoned, or
	// one whose session was reaped underneath it, must stop rather than
	// spend twenty minutes waiting for a Pod nobody will use.
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
		// A Pod name cannot be reused until the old one is really gone,
		// and delete is asynchronous — 30s of grace on a session Pod is
		// 30s during which create returns 409.
		if err := m.waitGone(ctx, e); err != nil {
			return err
		}

		e.jobs.enter("start")
		m.mu.Lock()
		if bank != "" {
			e.Bank = bank
		}
		now := m.now()
		e.StartedAt, e.LastSeen = now, now
		e.ExpiresAt = now.Add(m.cfg.MaxAge)
		e.addr, e.State, e.Error = "", Pending, ""
		m.mu.Unlock()

		// Through the same semaphore as a first boot: a recycle costs
		// exactly what a boot costs, and is no more entitled to a core.
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

// Status and Log expose one user's control job in the conductor's shape.
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

// Reap enforces every time limit and reconciles against the cluster. Run
// it on a ticker; it is the only thing that ends a session nobody ended
// deliberately.
func (m *Manager) Reap(ctx context.Context) {
	now := m.now()

	m.mu.Lock()
	// Lapsed holds first, so a seat a vanished user was granted returns
	// to the queue rather than staying reserved for them.
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
	// A snapshot of what is left, to reconcile without holding the lock
	// across API calls.
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

	// Reconcile: a Pod evicted, OOM-killed or lost with its node leaves a
	// session record holding a seat for something that no longer exists.
	for _, e := range live {
		m.mu.Lock()
		st, booting := e.State, e.State == Pending || e.State == Starting
		m.mu.Unlock()
		if booting {
			continue // the boot is watching it already
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

// Adopt re-attaches to Pods that outlived the hub process.
//
// Sessions live in the cluster, not in this process's memory: a hub
// redeployed mid-exam that forgot its sessions would strand every
// candidate behind a queue for seats that are already taken, with their
// own Pods running and unreachable.
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

// Run drives Reap until ctx is cancelled.
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

// --- seats and the queue -------------------------------------------

// usedLocked counts seats that are spoken for: running sessions plus
// outstanding holds. Holds count, or the seat a queued user was just
// granted would be taken by whoever asked next.
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

// claimLocked converts this user's outstanding hold into a seat.
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
	// Stable by arrival, so a restart or a map iteration cannot reorder
	// people who have been waiting.
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

// promoteLocked hands the head of the queue a hold if a seat is free.
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
	// One label is enough to find this hub's Pods and it is the one the
	// manager always sets.
	return "kubestronaut-sim/user"
}

func (m *Manager) podName(user string, kind Kind) string {
	return fmt.Sprintf("%s-%s-%s", m.cfg.PodPrefix, kind, podNameSafe(user))
}

// isGone treats "already deleted" as done rather than as an error, for
// every caller that wanted it deleted.
func isGone(err error) bool {
	return err != nil && errors.Is(err, ErrPodGone)
}

// The two conditions a Pods implementation must report distinguishably,
// declared here rather than imported from kube so this package does not
// depend on the transport. An adapter that forgets to translate its own
// not-found sentinel turns "the Pod is gone" into "something went wrong",
// and the manager would wait out a full timeout for a Pod that already
// vanished — so the adapter is where this is tested.
var (
	ErrPodGone   = errors.New("session: pod does not exist")
	ErrPodExists = errors.New("session: pod already exists")
)

// podNameSafe turns a user identifier into a DNS-1123 label.
//
// A GitHub numeric ID already is one. Header mode's identifier is
// whatever the upstream proxy sets, and an uppercase letter or an
// underscore there is not a validation error the candidate could ever
// act on — it is a 422 from the API server that reads like a hub bug.
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
	// Must start and end alphanumeric, and a Pod name is capped at 253.
	s = strings.Trim(string(out), "-")
	if s == "" {
		s = "anon"
	}
	if len(s) > 40 {
		s = strings.TrimRight(s[:40], "-")
	}
	return s
}
