package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"sort"
	"time"

	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/session"
)

var errPreparing = errors.New("an attempt is already being prepared")

var errPreparingCancelled = errors.New("the attempt was cancelled while its environment was being prepared")

var errClusterHoldsAnotherDraw = errors.New("the exam environment is still set up for an earlier attempt's questions; reset the environment before starting a different attempt")

var errPreparationLost = errors.New("the exam service restarted while an attempt's environment was being prepared or waiting to start, and that attempt cannot be resumed; reset the environment before starting a new one")

var errNothingPrepared = errors.New("no attempt is waiting to start; choose a mode to prepare one")

var errNotReady = errors.New("the exam environment is still being prepared; the attempt can start once it is ready")

type SeedState string

const (
	SeedRunning SeedState = "running"
	SeedDone    SeedState = "done"
	SeedFailed  SeedState = "failed"
	SeedUnknown SeedState = "unknown"
)

type SeedStatus struct {
	State SeedState

	Error string
}

type Seeder interface {
	Start(ctx context.Context, questions []string) (jobID string, err error)

	Status(ctx context.Context, jobID string) (SeedStatus, error)
}

func WithSeeder(s Seeder) Option {
	return func(srv *server) { srv.seeder = s }
}

func WithPrepFile(path string) Option {
	return func(srv *server) { srv.prepFile = path }
}

const prepPollInterval = 500 * time.Millisecond

const prepMaxPollErrors = 120

const prepPollTimeout = 15 * time.Second

type prep struct {
	gen uint64

	jobID     string
	mode      string
	dur       time.Duration
	draw      session.Draw
	startedAt time.Time

	awaitStart bool
	readyAt    time.Time
}

type preparingInfo struct {
	JobID string `json:"jobId"`
	Mode  string `json:"mode"`

	QuestionCount int    `json:"questionCount"`
	StartedAt     string `json:"startedAt"`
	Seed          string `json:"seed,omitempty"`
	PoolDigest    string `json:"poolDigest,omitempty"`

	DurationSeconds int    `json:"durationSeconds"`
	AwaitStart      bool   `json:"awaitStart,omitempty"`
	Ready           bool   `json:"ready,omitempty"`
	ReadyAt         string `json:"readyAt,omitempty"`
}

type prepareResponse struct {
	State         string   `json:"state"`
	Bank          string   `json:"bank"`
	Mode          string   `json:"mode"`
	JobID         string   `json:"jobId"`
	QuestionCount int      `json:"questionCount"`
	Seed          string   `json:"seed"`
	PoolDigest    string   `json:"poolDigest"`
	DomainFilter  []string `json:"domainFilter,omitempty"`
	PoolChanged   bool     `json:"poolChanged,omitempty"`
	AwaitStart    bool     `json:"awaitStart,omitempty"`
}

func (s *server) seedRequired() bool {

	if s.ex == nil {
		return false
	}
	return s.ex.Type != exam.TypeMCQ && exam.Pooled(s.ex)
}

func (s *server) beginPrepare(ctx context.Context, mode string, dur time.Duration, draw session.Draw, awaitStart bool) (prep, error) {
	s.prepMu.Lock()
	if s.prep != nil {
		s.prepMu.Unlock()
		return prep{}, errPreparing
	}

	s.prepGen++
	gen := s.prepGen
	s.prep = &prep{gen: gen, mode: mode, dur: dur, draw: draw, startedAt: time.Now(), awaitStart: awaitStart}

	s.prepError = ""
	s.prepMu.Unlock()

	jobID, err := s.seeder.Start(ctx, draw.QuestionIDs)
	if err != nil {
		s.clearPrep(gen, "")
		return prep{}, err
	}

	s.markSeeded(draw.QuestionIDs)

	s.prepMu.Lock()

	if s.prep == nil || s.prep.gen != gen {
		s.prepMu.Unlock()
		return prep{}, errPreparingCancelled
	}
	s.prep.jobID = jobID
	s.persistPrepLocked()
	current := *s.prep
	s.prepMu.Unlock()

	go s.watchPrepare(current)
	return current, nil
}

func (s *server) watchPrepare(p prep) {
	errs := 0
	for {

		if !s.prepIsCurrent(p.gen) {
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), prepPollTimeout)
		status, err := s.seeder.Status(ctx, p.jobID)
		cancel()

		switch {
		case err != nil:
			errs++
			if errs >= prepMaxPollErrors {
				s.failPrepare(p.gen, fmt.Sprintf("the exam environment stopped answering while it was being prepared: %v", err))
				return
			}
		case status.State == SeedRunning:
			errs = 0
		case status.State == SeedDone:
			if p.awaitStart {
				s.markReady(p.gen, time.Now())
				return
			}
			s.startPreparedAttempt(p)
			return
		case status.State == SeedFailed:
			s.failPrepare(p.gen, status.Error)
			return
		default:
			s.failPrepare(p.gen, "the exam environment lost track of the job preparing this attempt")
			return
		}

		time.Sleep(prepPollInterval)
	}
}

func (s *server) startPreparedAttempt(p prep) {
	if _, err := s.mgr.StartDraw(p.mode, p.dur, p.draw); err != nil {

		s.failPrepare(p.gen, err.Error())
		return
	}
	s.clearPrep(p.gen, "")
}

func (s *server) markReady(gen uint64, at time.Time) {
	s.prepMu.Lock()
	defer s.prepMu.Unlock()

	if s.prep == nil || s.prep.gen != gen {
		return
	}
	s.prep.readyAt = at
	s.persistPrepLocked()
	log.Printf("facilitator: %d question(s) seeded; waiting for the candidate to start the clock", len(s.prep.draw.QuestionIDs))
}

func (s *server) beginReadyAttempt() (session.Snapshot, error) {
	s.prepMu.Lock()
	defer s.prepMu.Unlock()

	if s.prep == nil {
		if snap := s.mgr.Snapshot(); snap.State == "running" {
			return snap, nil
		}
		return session.Snapshot{}, errNothingPrepared
	}
	if s.prep.readyAt.IsZero() {
		return session.Snapshot{}, errNotReady
	}
	snap, err := s.mgr.StartDraw(s.prep.mode, s.prep.dur, s.prep.draw)
	if err != nil {
		return session.Snapshot{}, err
	}
	s.prep = nil
	s.prepError = ""
	s.persistPrepLocked()
	return snap, nil
}

func (s *server) failPrepare(gen uint64, msg string) {
	if msg == "" {
		msg = "preparing the exam environment failed"
	}
	log.Printf("facilitator: attempt not started: %s", msg)
	s.clearPrep(gen, msg)
}

func (s *server) clearPrep(gen uint64, msg string) {
	s.prepMu.Lock()
	defer s.prepMu.Unlock()

	if s.prep == nil || s.prep.gen != gen {
		return
	}
	s.prep = nil
	s.prepError = msg
	s.persistPrepLocked()
}

func (s *server) prepIsCurrent(gen uint64) bool {
	s.prepMu.Lock()
	defer s.prepMu.Unlock()
	return s.prep != nil && s.prep.gen == gen
}

func (s *server) cancelPrep() {
	s.prepMu.Lock()
	defer s.prepMu.Unlock()

	s.prep = nil
	s.prepError = ""
	s.prepGen++
	s.persistPrepLocked()
}

type seededSet struct {
	ids []string

	named bool
}

func newSeededSet(ids []string) *seededSet {
	sorted := append([]string(nil), ids...)
	sort.Strings(sorted)
	return &seededSet{ids: sorted, named: true}
}

func (s *seededSet) matches(ids []string) bool {
	if s == nil {
		return true
	}
	if !s.named || len(s.ids) != len(ids) {
		return false
	}
	sorted := append([]string(nil), ids...)
	sort.Strings(sorted)
	for i := range sorted {
		if sorted[i] != s.ids[i] {
			return false
		}
	}
	return true
}

func (s *server) checkClusterFree(ids []string) error {
	s.prepMu.Lock()
	defer s.prepMu.Unlock()

	if s.seeded.matches(ids) {
		return nil
	}
	return errClusterHoldsAnotherDraw
}

func (s *server) markSeeded(ids []string) {
	s.prepMu.Lock()
	defer s.prepMu.Unlock()
	s.seeded = newSeededSet(ids)
}

func (s *server) clearSeeded() {
	s.prepMu.Lock()
	defer s.prepMu.Unlock()
	s.seeded = nil
}

func (s *server) controlProxy() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rebuildsCluster(r) {
			s.control.ServeHTTP(w, r)
			return
		}
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		s.control.ServeHTTP(rec, r)

		if rec.status >= 200 && rec.status < 300 {
			s.clearSeeded()
			s.cancelPrep()
		}
	})
}

func rebuildsCluster(r *http.Request) bool {
	if r.Method != http.MethodPost {
		return false
	}
	return r.URL.Path == "/api/control/reset" || r.URL.Path == "/api/control/switch"
}

type statusRecorder struct {
	http.ResponseWriter
	status  int
	written bool
}

func (w *statusRecorder) WriteHeader(status int) {
	if !w.written {
		w.status, w.written = status, true
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusRecorder) Write(b []byte) (int, error) {
	w.written = true
	return w.ResponseWriter.Write(b)
}

func (w *statusRecorder) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (s *server) startSeedProbe() {
	if !s.seedRequired() || s.control == nil {
		return
	}
	s.probeOnce.Do(func() { go s.probeSeeded() })
}

func (s *server) probeSeeded() {

	defer func() { _ = recover() }()

	s.prepMu.Lock()
	fresh := s.prepGen == 0 && s.prep == nil && s.prepError == ""
	s.prepMu.Unlock()
	if !fresh || s.mgr.Snapshot().State != "idle" {
		return
	}

	if !s.conductorHeldSeedJob() {
		return
	}
	s.prepMu.Lock()
	defer s.prepMu.Unlock()

	if s.prepGen != 0 || s.prep != nil || s.prepError != "" {
		return
	}
	log.Printf("facilitator: %v", errPreparationLost)

	s.seeded = &seededSet{}
	s.prepError = errPreparationLost.Error()
}

type conductorJob struct {
	ID    string `json:"id"`
	Op    string `json:"op"`
	Error string `json:"error"`
}

type conductorStatus struct {
	Job     *conductorJob `json:"job"`
	LastJob *conductorJob `json:"lastJob"`
}

func (s *server) conductorStatus() (conductorStatus, error) {
	ctx, cancel := context.WithTimeout(context.Background(), prepPollTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "/api/control/status", nil)
	if err != nil {
		return conductorStatus{}, err
	}
	rec := &bodyRecorder{header: http.Header{}, status: http.StatusOK}
	s.control.ServeHTTP(rec, req)
	if rec.status != http.StatusOK {
		return conductorStatus{}, fmt.Errorf("the environment service answered %d", rec.status)
	}

	var snap conductorStatus
	if err := json.Unmarshal(rec.body.Bytes(), &snap); err != nil {
		return conductorStatus{}, err
	}
	return snap, nil
}

func (s *server) conductorHeldSeedJob() bool {
	snap, err := s.conductorStatus()
	if err != nil {
		return false
	}
	if snap.Job != nil && snap.Job.Op == seedJobOp {
		return true
	}

	return snap.LastJob != nil && snap.LastJob.Op == seedJobOp
}

const seedJobOp = "seed"

type bodyRecorder struct {
	header http.Header
	body   bytes.Buffer
	status int
}

func (w *bodyRecorder) Header() http.Header         { return w.header }
func (w *bodyRecorder) WriteHeader(status int)      { w.status = status }
func (w *bodyRecorder) Write(b []byte) (int, error) { return w.body.Write(b) }

func (s *server) prepSnapshot() (*preparingInfo, string) {
	s.prepMu.Lock()
	defer s.prepMu.Unlock()

	if s.prep == nil {
		return nil, s.prepError
	}
	info := &preparingInfo{
		JobID:           s.prep.jobID,
		Mode:            s.prep.mode,
		QuestionCount:   len(s.prep.draw.QuestionIDs),
		StartedAt:       s.prep.startedAt.UTC().Format(time.RFC3339Nano),
		Seed:            s.prep.draw.Seed,
		PoolDigest:      s.prep.draw.PoolDigest,
		DurationSeconds: int(s.prep.dur.Seconds()),
		AwaitStart:      s.prep.awaitStart,
	}
	if !s.prep.readyAt.IsZero() {
		info.Ready = true
		info.ReadyAt = s.prep.readyAt.UTC().Format(time.RFC3339Nano)
	}
	return info, s.prepError
}
