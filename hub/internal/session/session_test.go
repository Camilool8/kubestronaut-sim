package session

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"
)

type fakePods struct {
	mu      sync.Mutex
	pods    map[string]*Pod
	created []string

	specs [][]byte

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
	f.specs = append(f.specs, append([]byte(nil), spec...))
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

func (f *fakePods) lastSpec() string {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.specs) == 0 {
		return ""
	}
	return string(f.specs[len(f.specs)-1])
}

func TestTheChosenExamIsWhatTheSessionSits(t *testing.T) {
	m, pods := newManager(t, 1, nil)

	if _, err := m.Start(context.Background(), "583231", Practical, "cka-mock-01"); err != nil {
		t.Fatal(err)
	}
	live := waitReady(t, m, "583231")
	if live.Bank != "cka-mock-01" {
		t.Errorf("bank = %q, want the exam that was chosen", live.Bank)
	}

	if spec := pods.lastSpec(); !strings.Contains(spec, `"cka-mock-01"`) {
		t.Errorf("the chosen exam never reached the Pod spec: %s", spec)
	}
}

func TestAnExamWithItsOwnPodSpecGetsIt(t *testing.T) {
	special := `{"kind":"Pod","metadata":{},"spec":{"containers":[` +
		`{"name":"facilitator","env":[{"name":"BANK","value":"x"}]},` +
		`{"name":"an-extra-node","env":[]}]}}`
	m, pods := newManager(t, 1, func(cfg *Config) {
		fl := cfg.Flavours[Practical]
		fl.BankTemplates = map[string]Template{"cka-mock-01": Template(special)}
		cfg.Flavours[Practical] = fl
	})

	if _, err := m.Start(context.Background(), "583231", Practical, "cka-mock-01"); err != nil {
		t.Fatal(err)
	}
	waitReady(t, m, "583231")
	if spec := pods.lastSpec(); !strings.Contains(spec, "an-extra-node") {
		t.Errorf("the exam's own Pod spec was not used: %s", spec)
	}
}

func TestAnExamWithNoPodSpecOfItsOwnUsesTheFlavours(t *testing.T) {
	m, pods := newManager(t, 1, func(cfg *Config) {
		fl := cfg.Flavours[Practical]
		fl.BankTemplates = map[string]Template{"cka-mock-01": Template(miniTemplate)}
		cfg.Flavours[Practical] = fl
	})

	if _, err := m.Start(context.Background(), "583231", Practical, "ckad-mock-01"); err != nil {
		t.Fatal(err)
	}
	waitReady(t, m, "583231")
	if spec := pods.lastSpec(); !strings.Contains(spec, `"ckad-mock-01"`) {
		t.Errorf("the default template did not carry the chosen exam: %s", spec)
	}
}

func TestStartCreatesAPodAndBecomesReady(t *testing.T) {
	m, pods := newManager(t, 1, nil)
	ctx := context.Background()

	s, err := m.Start(ctx, "583231", Practical, "")
	if err != nil {
		t.Fatal(err)
	}

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

	if _, err := m.Start(ctx, "583231", Practical, ""); err != nil {
		t.Fatal(err)
	}
	if pods.count() != 1 {
		t.Errorf("a second start created a second pod")
	}
}

func TestASeatIsHeldWhileTheSessionIsStillBooting(t *testing.T) {
	m, pods := newManager(t, 1, nil)
	pods.notReady["sim-session-practical-first"] = true
	ctx := context.Background()

	if _, err := m.Start(ctx, "first", Practical, ""); err != nil {
		t.Fatal(err)
	}
	_, err := m.Start(ctx, "second", Practical, "")
	var q *Queued
	if !errors.As(err, &q) {
		t.Fatalf("second candidate got %v, want a queue position", err)
	}
	if q.Position != 1 {
		t.Errorf("position = %d, want 1", q.Position)
	}
}

func TestTheQueueHeadGetsAHoldAndOnlyTheyCanClaimIt(t *testing.T) {
	now := time.Now()
	m, _ := newManager(t, 1, func(c *Config) {
		c.HoldFor = time.Minute
		c.Now = func() time.Time { return now }
	})
	ctx := context.Background()

	if _, err := m.Start(ctx, "holder", Practical, ""); err != nil {
		t.Fatal(err)
	}
	waitReady(t, m, "holder")

	for _, u := range []string{"queued-1", "queued-2"} {
		if _, err := m.Start(ctx, u, Practical, ""); err == nil {
			t.Fatalf("%s was admitted with no free seat", u)
		}
	}
	if got := m.Position("queued-1"); got != 1 {
		t.Errorf("queued-1 position = %d, want 1", got)
	}

	if err := m.End(ctx, "holder"); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Start(ctx, "queued-2", Practical, ""); err == nil {
		t.Error("queued-2 jumped the queue")
	}
	if _, err := m.Start(ctx, "queued-1", Practical, ""); err != nil {
		t.Fatalf("the head of the queue could not claim its seat: %v", err)
	}
	waitReady(t, m, "queued-1")
	if got := m.Position("queued-1"); got != 0 {
		t.Errorf("queued-1 is still in the queue at %d", got)
	}
}

func TestAnUnclaimedHoldLapsesAndThePersonBehindGetsTheSeat(t *testing.T) {
	now := time.Now()
	clock := func() time.Time { return now }
	m, _ := newManager(t, 1, func(c *Config) {
		c.HoldFor = time.Minute
		c.Now = clock
	})
	ctx := context.Background()

	if _, err := m.Start(ctx, "holder", Practical, ""); err != nil {
		t.Fatal(err)
	}
	waitReady(t, m, "holder")
	m.Start(ctx, "ghost", Practical, "")
	m.Start(ctx, "patient", Practical, "")
	if err := m.End(ctx, "holder"); err != nil {
		t.Fatal(err)
	}

	now = now.Add(2 * time.Minute)
	m.Reap(ctx)

	if got := m.Position("ghost"); got != 0 {
		t.Errorf("ghost is still queued at %d", got)
	}
	if _, err := m.Start(ctx, "patient", Practical, ""); err != nil {
		t.Fatalf("patient still cannot start after the hold lapsed: %v", err)
	}
}

func TestPodCreationIsSerialised(t *testing.T) {
	m, pods := newManager(t, 3, func(c *Config) { c.BootConcurrency = 1 })
	ctx := context.Background()
	for _, u := range []string{"a", "b", "c"} {
		pods.notReady["sim-session-practical-"+u] = true
	}

	for _, u := range []string{"a", "b", "c"} {
		if _, err := m.Start(ctx, u, Practical, ""); err != nil {
			t.Fatalf("%s: %v", u, err)
		}
	}

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
		if _, err := m.Start(ctx, u, Practical, ""); err != nil {
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

func TestAVanishedPodFreesItsSeat(t *testing.T) {
	m, pods := newManager(t, 1, nil)
	ctx := context.Background()
	if _, err := m.Start(ctx, "unlucky", Practical, ""); err != nil {
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
	if _, err := m.Start(ctx, "next", Practical, ""); err != nil {
		t.Errorf("the seat was never released: %v", err)
	}
}

func TestAdoptReattachesToRunningSessions(t *testing.T) {
	m, pods := newManager(t, 2, nil)
	ctx := context.Background()
	if _, err := m.Start(ctx, "583231", Practical, ""); err != nil {
		t.Fatal(err)
	}
	waitReady(t, m, "583231")

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

func TestRecycleReplacesThePodAndReportsPhases(t *testing.T) {
	m, pods := newManager(t, 1, nil)
	ctx := context.Background()
	if _, err := m.Start(ctx, "583231", Practical, ""); err != nil {
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

func TestStartWaitsOutAPodStillTerminating(t *testing.T) {
	m, pods := newManager(t, 1, nil)
	ctx := context.Background()

	name := "sim-session-practical-583231"
	if err := pods.Create(ctx, []byte(`{"metadata":{"name":"`+name+`"}}`)); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Start(ctx, "583231", Practical, ""); err != nil {
		t.Fatal(err)
	}

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
	if _, err := m.Start(context.Background(), "u", MCQ, ""); !errors.Is(err, ErrNoSuchKind) {
		t.Errorf("err = %v, want ErrNoSuchKind for a flavour this deployment does not offer", err)
	}
}

func TestGetReportsTheControlOpWhileARebuildRuns(t *testing.T) {
	m, pods := newManager(t, 1, nil)
	if _, err := m.Start(context.Background(), "583231", Practical, ""); err != nil {
		t.Fatal(err)
	}
	waitReady(t, m, "583231")

	if s, _ := m.Get("583231"); s.Op != "" {
		t.Errorf("op = %q on a settled session, want empty", s.Op)
	}

	name := pods.created[0]
	pods.mu.Lock()
	pods.notReady[name] = true
	pods.mu.Unlock()

	if _, err := m.Recycle("583231", ""); err != nil {
		t.Fatal(err)
	}

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		s, err := m.Get("583231")
		if err == nil && s.Op == "reset" {
			if s.Addr() != "" {
				t.Errorf("addr = %q mid-rebuild, want empty", s.Addr())
			}
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("Get never reported the reset in flight")
}

func TestRecycleRestampsTheClockWhenItBeginsNotWhenThePodIsRecreated(t *testing.T) {
	m, _ := newManager(t, 1, nil)
	if _, err := m.Start(context.Background(), "583231", Practical, ""); err != nil {
		t.Fatal(err)
	}
	waitReady(t, m, "583231")

	before, err := m.Get("583231")
	if err != nil {
		t.Fatal(err)
	}

	if _, err := m.Recycle("583231", ""); err != nil {
		t.Fatal(err)
	}

	after, err := m.Get("583231")
	if err != nil {
		t.Fatal(err)
	}
	if !after.StartedAt.After(before.StartedAt) {
		t.Errorf("startedAt = %v, want later than the original %v", after.StartedAt, before.StartedAt)
	}
}
