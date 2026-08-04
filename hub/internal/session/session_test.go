package session

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"
)

// fakePods is an in-memory cluster. It exists so the manager's rules —
// seats, queue, holds, reaping — are tested without an API server, and
// so a test can hold a Pod un-ready for as long as it likes.
type fakePods struct {
	mu      sync.Mutex
	pods    map[string]*Pod
	created []string
	// notReady names Pods that never become ready, to exercise the
	// waiting paths.
	notReady   map[string]bool
	failCreate error
}

func newFakePods() *fakePods {
	return &fakePods{pods: map[string]*Pod{}, notReady: map[string]bool{}}
}

func (f *fakePods) Create(_ context.Context, spec []byte) error {
	var pod struct {
		Metadata struct {
			Name   string            `json:"name"`
			Labels map[string]string `json:"labels"`
		} `json:"metadata"`
	}
	if err := json.Unmarshal(spec, &pod); err != nil {
		return err
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failCreate != nil {
		return f.failCreate
	}
	name := pod.Metadata.Name
	if _, exists := f.pods[name]; exists {
		return ErrPodExists
	}
	f.created = append(f.created, name)
	f.pods[name] = &Pod{
		Name: name, IP: "10.42.0.9", Phase: "Running",
		Ready: !f.notReady[name], CreatedAt: time.Now(), Labels: pod.Metadata.Labels,
	}
	return nil
}

func (f *fakePods) Get(_ context.Context, name string) (Pod, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	p, ok := f.pods[name]
	if !ok {
		return Pod{}, ErrPodGone
	}
	return *p, nil
}

func (f *fakePods) Delete(_ context.Context, name string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.pods[name]; !ok {
		return ErrPodGone
	}
	delete(f.pods, name)
	return nil
}

func (f *fakePods) List(context.Context, string) ([]Pod, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []Pod
	for _, p := range f.pods {
		out = append(out, *p)
	}
	return out, nil
}

func (f *fakePods) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.pods)
}

const miniTemplate = `{"kind":"Pod","metadata":{},"spec":{"containers":[{"name":"facilitator","env":[{"name":"BANK","value":"x"}]}]}}`

func newManager(t *testing.T, seats int, tweak func(*Config)) (*Manager, *fakePods) {
	t.Helper()
	pods := newFakePods()
	cfg := Config{
		Flavours: map[Kind]Flavour{
			Practical: {Seats: seats, Template: Template(miniTemplate), Bank: "ckad-mock-01"},
		},
		HoldFor:   time.Minute,
		IdleAfter: 30 * time.Minute,
		MaxAge:    10 * time.Hour,
		Logf:      func(string, ...any) {},
	}
	if tweak != nil {
		tweak(&cfg)
	}
	return New(pods, cfg), pods
}

// waitReady polls the manager the way the SPA does.
func waitReady(t *testing.T, m *Manager, user string) Session {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		s, err := m.Get(user)
		if err == nil && s.State == Ready {
			return s
		}
		if err == nil && s.State == Failed {
			t.Fatalf("%s failed: %s", user, s.Error)
		}
		time.Sleep(5 * time.Millisecond)
	}
	s, _ := m.Get(user)
	t.Fatalf("%s never became ready (state %q)", user, s.State)
	return Session{}
}

func TestStartCreatesAPodAndBecomesReady(t *testing.T) {
	m, pods := newManager(t, 1, nil)
	ctx := context.Background()

	s, err := m.Start(ctx, "583231", Practical)
	if err != nil {
		t.Fatal(err)
	}
	// Admission returns immediately: the boot takes minutes and the
	// browser polls.
	if s.State != Pending {
		t.Errorf("state = %q, want pending", s.State)
	}
	live := waitReady(t, m, "583231")
	if live.Addr() != "10.42.0.9:8080" {
		t.Errorf("addr = %q", live.Addr())
	}
	if pods.count() != 1 {
		t.Errorf("%d pods exist, want 1", pods.count())
	}
	// Idempotent: a second start returns the same session, not a second
	// Pod and not a queue position.
	if _, err := m.Start(ctx, "583231", Practical); err != nil {
		t.Fatal(err)
	}
	if pods.count() != 1 {
		t.Errorf("a second start created a second pod")
	}
}

// A seat is held from admission, not from readiness. Counting only ready
// sessions would admit a second candidate while the first is still
// booting, and hand both of them a half-built cluster.
func TestASeatIsHeldWhileTheSessionIsStillBooting(t *testing.T) {
	m, pods := newManager(t, 1, nil)
	pods.notReady["sim-session-practical-first"] = true
	ctx := context.Background()

	if _, err := m.Start(ctx, "first", Practical); err != nil {
		t.Fatal(err)
	}
	_, err := m.Start(ctx, "second", Practical)
	var q *Queued
	if !errors.As(err, &q) {
		t.Fatalf("second candidate got %v, want a queue position", err)
	}
	if q.Position != 1 {
		t.Errorf("position = %d, want 1", q.Position)
	}
}

// The queue hands the head a time-boxed hold, not a seat. A browser that
// closed an hour ago must not keep one warm.
func TestTheQueueHeadGetsAHoldAndOnlyTheyCanClaimIt(t *testing.T) {
	now := time.Now()
	m, _ := newManager(t, 1, func(c *Config) {
		c.HoldFor = time.Minute
		c.Now = func() time.Time { return now }
	})
	ctx := context.Background()

	if _, err := m.Start(ctx, "holder", Practical); err != nil {
		t.Fatal(err)
	}
	waitReady(t, m, "holder")

	// Two candidates queue, in order.
	for _, u := range []string{"queued-1", "queued-2"} {
		if _, err := m.Start(ctx, u, Practical); err == nil {
			t.Fatalf("%s was admitted with no free seat", u)
		}
	}
	if got := m.Position("queued-1"); got != 1 {
		t.Errorf("queued-1 position = %d, want 1", got)
	}

	// The seat frees. The head — and only the head — may take it.
	if err := m.End(ctx, "holder"); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Start(ctx, "queued-2", Practical); err == nil {
		t.Error("queued-2 jumped the queue")
	}
	if _, err := m.Start(ctx, "queued-1", Practical); err != nil {
		t.Fatalf("the head of the queue could not claim its seat: %v", err)
	}
	waitReady(t, m, "queued-1")
	if got := m.Position("queued-1"); got != 0 {
		t.Errorf("queued-1 is still in the queue at %d", got)
	}
}

// A hold nobody claims must lapse, or one vanished browser costs a seat
// for as long as the deployment runs.
func TestAnUnclaimedHoldLapsesAndThePersonBehindGetsTheSeat(t *testing.T) {
	now := time.Now()
	clock := func() time.Time { return now }
	m, _ := newManager(t, 1, func(c *Config) {
		c.HoldFor = time.Minute
		c.Now = clock
	})
	ctx := context.Background()

	if _, err := m.Start(ctx, "holder", Practical); err != nil {
		t.Fatal(err)
	}
	waitReady(t, m, "holder")
	m.Start(ctx, "ghost", Practical)
	m.Start(ctx, "patient", Practical)
	if err := m.End(ctx, "holder"); err != nil {
		t.Fatal(err)
	}

	// The ghost never comes back.
	now = now.Add(2 * time.Minute)
	m.Reap(ctx)

	if got := m.Position("ghost"); got != 0 {
		t.Errorf("ghost is still queued at %d", got)
	}
	if _, err := m.Start(ctx, "patient", Practical); err != nil {
		t.Fatalf("patient still cannot start after the hold lapsed: %v", err)
	}
}

// Boot is CPU-bound: one booting session took a 4-core node to 77% CPU.
// Two at once do not take turns, they both crawl — so the manager must
// not have two Pods booting simultaneously.
func TestPodCreationIsSerialised(t *testing.T) {
	m, pods := newManager(t, 3, func(c *Config) { c.BootConcurrency = 1 })
	ctx := context.Background()
	for _, u := range []string{"a", "b", "c"} {
		pods.notReady["sim-session-practical-"+u] = true
	}

	for _, u := range []string{"a", "b", "c"} {
		if _, err := m.Start(ctx, u, Practical); err != nil {
			t.Fatalf("%s: %v", u, err)
		}
	}
	// All three hold seats; only one Pod may exist, because the other two
	// are still waiting for the boot slot.
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) && pods.count() == 0 {
		time.Sleep(5 * time.Millisecond)
	}
	time.Sleep(50 * time.Millisecond)
	if n := pods.count(); n != 1 {
		t.Errorf("%d pods booting at once, want 1", n)
	}
}

func TestIdleAndAgedSessionsAreReaped(t *testing.T) {
	now := time.Now()
	m, pods := newManager(t, 4, func(c *Config) {
		c.IdleAfter = 30 * time.Minute
		c.MaxAge = 2 * time.Hour
		c.Now = func() time.Time { return now }
	})
	ctx := context.Background()

	for _, u := range []string{"idle", "old", "active"} {
		if _, err := m.Start(ctx, u, Practical); err != nil {
			t.Fatal(err)
		}
		waitReady(t, m, u)
	}

	now = now.Add(31 * time.Minute)
	m.Touch("active")
	m.Touch("old")
	m.Reap(ctx)

	if _, err := m.Get("idle"); !errors.Is(err, ErrNoSession) {
		t.Error("an idle session survived the reaper")
	}
	if _, err := m.Get("active"); err != nil {
		t.Error("a session someone is using was reaped")
	}
	if pods.count() != 2 {
		t.Errorf("%d pods left, want 2", pods.count())
	}

	// The hard cap ignores activity entirely: that is what makes it a cap.
	now = now.Add(2 * time.Hour)
	m.Touch("active")
	m.Touch("old")
	m.Reap(ctx)
	for _, u := range []string{"active", "old"} {
		if _, err := m.Get(u); !errors.Is(err, ErrNoSession) {
			t.Errorf("%s outlived the maximum session length", u)
		}
	}
}

// A Pod lost with its node, evicted, or deleted by an operator leaves a
// session record holding a seat for something that no longer exists.
func TestAVanishedPodFreesItsSeat(t *testing.T) {
	m, pods := newManager(t, 1, nil)
	ctx := context.Background()
	if _, err := m.Start(ctx, "unlucky", Practical); err != nil {
		t.Fatal(err)
	}
	waitReady(t, m, "unlucky")

	if err := pods.Delete(ctx, "sim-session-practical-unlucky"); err != nil {
		t.Fatal(err)
	}
	m.Reap(ctx)

	if _, err := m.Get("unlucky"); !errors.Is(err, ErrNoSession) {
		t.Error("the session outlived its pod")
	}
	if _, err := m.Start(ctx, "next", Practical); err != nil {
		t.Errorf("the seat was never released: %v", err)
	}
}

// Sessions live in the cluster, not in the hub's memory. A hub
// redeployed mid-exam that forgot them would put every candidate behind
// a queue for seats that are already taken, with their own Pods running
// and unreachable.
func TestAdoptReattachesToRunningSessions(t *testing.T) {
	m, pods := newManager(t, 2, nil)
	ctx := context.Background()
	if _, err := m.Start(ctx, "583231", Practical); err != nil {
		t.Fatal(err)
	}
	waitReady(t, m, "583231")

	// A brand new Manager over the same cluster: the process restarted.
	fresh := New(pods, Config{
		Flavours: map[Kind]Flavour{Practical: {Seats: 2, Template: Template(miniTemplate)}},
		Logf:     func(string, ...any) {},
	})
	if err := fresh.Adopt(ctx); err != nil {
		t.Fatal(err)
	}
	got, err := fresh.Get("583231")
	if err != nil {
		t.Fatalf("the session was not adopted: %v", err)
	}
	if got.State != Ready || got.Addr() != "10.42.0.9:8080" {
		t.Errorf("adopted session = %+v, addr %q", got, got.Addr())
	}
	if seats := fresh.Seats()[Practical]; seats[0] != 1 {
		t.Errorf("adopted seats used = %d, want 1", seats[0])
	}
}

// A reset is a Pod replacement here, reported in the conductor's job
// shape so ControlProgress renders it with no hosted branch.
func TestRecycleReplacesThePodAndReportsPhases(t *testing.T) {
	m, pods := newManager(t, 1, nil)
	ctx := context.Background()
	if _, err := m.Start(ctx, "583231", Practical); err != nil {
		t.Fatal(err)
	}
	waitReady(t, m, "583231")
	before := pods.created[0]

	job, err := m.Recycle("583231", "ckad-mock-02")
	if err != nil {
		t.Fatal(err)
	}
	if job.Op != "switch" || job.Bank != "ckad-mock-02" {
		t.Errorf("job = %+v, want a switch to ckad-mock-02", job)
	}
	if len(job.Phases) != 3 {
		t.Errorf("%d phases, want 3", len(job.Phases))
	}

	// A second control operation while one is in flight is a 409, as it
	// is on the conductor.
	if _, err := m.Recycle("583231", ""); !errors.Is(err, ErrBusy) {
		t.Errorf("a concurrent recycle gave %v, want ErrBusy", err)
	}

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if snap, _ := m.Status("583231"); !snap.Busy && snap.Last != nil {
			if snap.Last.Error != "" {
				t.Fatalf("recycle failed: %s", snap.Last.Error)
			}
			for _, p := range snap.Last.Phases {
				if p.State != PhaseDone {
					t.Errorf("phase %s ended %q, want done", p.ID, p.State)
				}
			}
			s, _ := m.Get("583231")
			if s.Bank != "ckad-mock-02" {
				t.Errorf("bank = %q after the switch", s.Bank)
			}
			if len(pods.created) != 2 || pods.created[1] != before {
				t.Errorf("created = %v, want the pod recreated", pods.created)
			}
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("the recycle job never finished")
}

// Reachable, not theoretical: a reaped session deletes its Pod, the
// candidate presses start again, and the old Pod still owns the name for
// the length of its grace period.
func TestStartWaitsOutAPodStillTerminating(t *testing.T) {
	m, pods := newManager(t, 1, nil)
	ctx := context.Background()

	// A Pod under the name the next session will want.
	name := "sim-session-practical-583231"
	if err := pods.Create(ctx, []byte(`{"metadata":{"name":"`+name+`"}}`)); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Start(ctx, "583231", Practical); err != nil {
		t.Fatal(err)
	}

	// It is stuck until the name frees, and then it proceeds.
	time.Sleep(30 * time.Millisecond)
	if s, _ := m.Get("583231"); s.State == Ready {
		t.Fatal("it adopted the pod that was on its way out")
	}
	if err := pods.Delete(ctx, name); err != nil {
		t.Fatal(err)
	}
	waitReady(t, m, "583231")
}

func TestUnknownKindIsRefused(t *testing.T) {
	m, _ := newManager(t, 1, nil)
	if _, err := m.Start(context.Background(), "u", MCQ); !errors.Is(err, ErrNoSuchKind) {
		t.Errorf("err = %v, want ErrNoSuchKind for a flavour this deployment does not offer", err)
	}
}
