package api

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/session"
)

// errPreparing rejects a second start while one attempt is already
// having its cluster prepared. Mapped to 409, the same status a start
// against a running session gets, because it is the same answer: an
// attempt already has this session.
var errPreparing = errors.New("an attempt is already being prepared")

// errPreparingCancelled reports that the preparation was abandoned
// (DELETE /api/session) while the request that began it was still in
// flight. Also 409: the caller's attempt did not happen, and the reason
// is that something else deliberately cancelled it.
var errPreparingCancelled = errors.New("the attempt was cancelled while its environment was being prepared")

// SeedState is where a seed job has got to, as the facilitator needs to
// read it. Deliberately not the conductor's job.Snapshot: this side of
// the wire cares about exactly four outcomes and none of the phases.
type SeedState string

const (
	// SeedRunning: still working. Keep watching.
	SeedRunning SeedState = "running"
	// SeedDone: the cluster is prepared. The attempt may begin.
	SeedDone SeedState = "done"
	// SeedFailed: it did not finish. The attempt must NOT begin.
	SeedFailed SeedState = "failed"
	// SeedUnknown: the conductor has no record of this job at all, which
	// after a conductor restart is the honest answer. Treated as a
	// failure, never as either of the two above — "I don't know" must not
	// be able to start an exam clock, and must not hang a candidate on a
	// progress screen forever either.
	SeedUnknown SeedState = "unknown"
)

// SeedStatus is one poll of a seed job.
type SeedStatus struct {
	State SeedState
	// Error is the job's failure message, set only for SeedFailed.
	Error string
}

// Seeder prepares the exam cluster for a drawn set of questions.
//
// An interface rather than the /api/control reverse proxy the browser
// uses, for the same two reasons BanksFetcher is one: this is a
// server-side call the facilitator makes on its own behalf, and a test
// must be able to answer it without a socket or a Docker daemon.
type Seeder interface {
	// Start asks for the questions to be seeded and returns the id of the
	// job doing it.
	Start(ctx context.Context, questions []string) (jobID string, err error)
	// Status reports where that job has got to.
	Status(ctx context.Context, jobID string) (SeedStatus, error)
}

// WithSeeder gives the server its route to the conductor's seed job.
//
// Without it a pooled hands-on bank cannot start an attempt at all
// (503): the cluster for such a bank is deliberately empty until
// something seeds it, and starting a timed attempt against an empty
// cluster would score a candidate zero for questions whose fixtures were
// never created. Every other bank never reaches this code and does not
// care whether a seeder was wired.
func WithSeeder(s Seeder) Option {
	return func(srv *server) { srv.seeder = s }
}

// prepPollInterval is how often the watcher asks the conductor whether
// the seed job has settled. Fast, because the whole cost of being slow
// is paid by a candidate staring at a finished progress bar: the client's
// terminal condition is this server clearing `preparing`, not the job
// going idle, so this interval is the lag between the two.
const prepPollInterval = 500 * time.Millisecond

// prepMaxPollErrors is how many consecutive failed status polls the
// watcher tolerates before giving the preparation up as lost — 60
// seconds at the interval above.
//
// A count rather than a wall-clock budget on the whole preparation,
// because the preparation's real budget belongs to the conductor (one
// per question, see control.seedQuestionBudget) and duplicating it here
// would mean two timeouts that disagree. The only failure this side can
// actually detect is "the conductor stopped answering", and that is what
// this counts.
const prepMaxPollErrors = 120

// prepPollTimeout bounds one status poll. Generous relative to the
// interval, because a slow answer is still an answer and a Seeder
// implementation is expected to carry its own client timeout.
const prepPollTimeout = 15 * time.Second

// prep is one attempt waiting on its cluster: the draw that has been
// made, the clock it will get, and the conductor job preparing for it.
//
// Held in memory and never persisted, unlike everything about a started
// attempt. Persisting it would mean a fourth session state on disk (and
// the version bump that discards everyone's in-flight attempt) to buy
// recovery for a window that only exists between two clicks. A
// facilitator restart during preparation therefore abandons it: the
// session is idle, which is true, and the candidate presses Start again.
type prep struct {
	// gen is the stale-goroutine guard, in the same spirit as the job
	// store's currentIfLocked: a watcher acts only while the preparation
	// it was launched for is still the current one, so a preparation
	// cancelled by DELETE /api/session can never come back minutes later
	// and start an exam nobody asked for.
	gen uint64

	jobID     string
	mode      string
	dur       time.Duration
	draw      session.Draw
	startedAt time.Time
}

// preparingInfo is the `preparing` object on GET /api/session.
type preparingInfo struct {
	JobID string `json:"jobId"`
	Mode  string `json:"mode"`
	// QuestionCount is how many questions are being seeded, which is also
	// how many the attempt will contain.
	QuestionCount int    `json:"questionCount"`
	StartedAt     string `json:"startedAt"`
	Seed          string `json:"seed,omitempty"`
	PoolDigest    string `json:"poolDigest,omitempty"`
}

// prepareResponse is POST /api/session/start's 202 body: an attempt that
// has been DRAWN but not started.
//
// A shape of its own rather than a sessionResponse with a fourth state,
// because it is not a session — the session is still idle, DELETE still
// resets it, and every client that only understands idle/running/ended
// keeps reading a truthful GET /api/session throughout. The status code
// is the branch: 200 means the attempt is running, 202 means watch and
// wait.
type prepareResponse struct {
	// State is always "preparing". Present so a client that logs the body
	// has something to log, and so the two start responses cannot be
	// confused by eye.
	State         string   `json:"state"`
	Bank          string   `json:"bank"`
	Mode          string   `json:"mode"`
	JobID         string   `json:"jobId"`
	QuestionCount int      `json:"questionCount"`
	Seed          string   `json:"seed"`
	PoolDigest    string   `json:"poolDigest"`
	DomainFilter  []string `json:"domainFilter,omitempty"`
	PoolChanged   bool     `json:"poolChanged,omitempty"`
}

// seedRequired reports whether an attempt on this bank needs its cluster
// prepared before the clock may start.
//
// It asks about the BANK, never about the draw, and that is the whole
// correctness argument: images/k8s-env/bootstrap.sh decides whether to
// seed at boot from exactly the same predicate, so the two halves cannot
// disagree about whether a cluster already holds the questions. A
// domain-filtered attempt on an UNPOOLED hands-on bank draws a subset
// too, and must not be seeded — its cluster was prepared for the whole
// bank at boot, and re-running setup.sh would cost minutes to arrive
// back where it already was.
func (s *server) seedRequired() bool {
	return s.ex.Type != exam.TypeMCQ && exam.Pooled(s.ex)
}

// beginPrepare asks the conductor to seed the drawn questions and starts
// watching the job. The session stays idle throughout; it is started, by
// startPreparedAttempt below, only once the seeding has succeeded.
func (s *server) beginPrepare(ctx context.Context, mode string, dur time.Duration, draw session.Draw) (prep, error) {
	s.prepMu.Lock()
	if s.prep != nil {
		s.prepMu.Unlock()
		return prep{}, errPreparing
	}
	// Reserved before the (slow) call to the conductor, so two starts
	// arriving together cannot both get past this check and both seed.
	s.prepGen++
	gen := s.prepGen
	s.prep = &prep{gen: gen, mode: mode, dur: dur, draw: draw, startedAt: time.Now()}
	// The previous attempt's failure is answered by trying again, so it
	// stops being reported the moment someone does.
	s.prepError = ""
	s.prepMu.Unlock()

	jobID, err := s.seeder.Start(ctx, draw.QuestionIDs)
	if err != nil {
		s.clearPrep(gen, "")
		return prep{}, err
	}

	s.prepMu.Lock()
	// Still ours? A DELETE /api/session between the two locks cancelled
	// this preparation, and the job it started is now something nobody is
	// waiting for. Nothing to undo — the seeding is harmless and the next
	// start re-seeds whatever it draws — but this must not go on to watch
	// it and start an attempt.
	if s.prep == nil || s.prep.gen != gen {
		s.prepMu.Unlock()
		return prep{}, errPreparingCancelled
	}
	s.prep.jobID = jobID
	current := *s.prep
	s.prepMu.Unlock()

	go s.watchPrepare(current)
	return current, nil
}

// watchPrepare polls the seed job until it settles, then either starts
// the attempt or records why it could not.
//
// Its own goroutine, and it outlives the request that spawned it on
// purpose: the browser may reload, navigate away or crash while a
// four-minute seed runs, and the attempt must still be startable when it
// comes back. It uses context.Background for the same reason — the
// request's context is cancelled the moment the 202 is written.
func (s *server) watchPrepare(p prep) {
	errs := 0
	for {
		// Cheapest possible check that this preparation is still wanted,
		// before spending a round trip on it.
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
			s.startPreparedAttempt(p)
			return
		case status.State == SeedFailed:
			s.failPrepare(p.gen, status.Error)
			return
		default:
			s.failPrepare(p.gen, "the exam environment lost track of the job preparing this attempt")
			return
		}

		// The sleep is at the BOTTOM, so the first poll happens at once.
		// A seed that is already done — a one-question pool, a retry after
		// the job settled — must not cost the candidate half a second of
		// staring at a finished progress bar to discover it.
		time.Sleep(prepPollInterval)
	}
}

// startPreparedAttempt starts the clock on a preparation that succeeded.
//
// The order here is the contract: the session is started FIRST and the
// preparation cleared second, so a client polling GET /api/session never
// observes a moment with neither `preparing` nor a running attempt. That
// is what lets the client's terminal condition be "preparing is gone"
// rather than "the control job went idle" — the latter races, because
// the job settles in the conductor a poll before this runs.
func (s *server) startPreparedAttempt(p prep) {
	if _, err := s.mgr.StartDraw(p.mode, p.dur, p.draw); err != nil {
		// The session stopped being idle under us (a concurrent start, a
		// reset). The cluster is prepared for a draw nobody will sit, which
		// costs nothing but the seeding already done.
		s.failPrepare(p.gen, err.Error())
		return
	}
	s.clearPrep(p.gen, "")
}

// failPrepare ends a preparation with a message the next GET
// /api/session reports as prepareError, leaving the session idle.
func (s *server) failPrepare(gen uint64, msg string) {
	if msg == "" {
		msg = "preparing the exam environment failed"
	}
	log.Printf("facilitator: attempt not started: %s", msg)
	s.clearPrep(gen, msg)
}

// clearPrep drops the preparation identified by gen and records msg as
// the reason, if any. A gen that is no longer current is ignored — the
// same stale-writer guard the job store applies to its own phases.
func (s *server) clearPrep(gen uint64, msg string) {
	s.prepMu.Lock()
	defer s.prepMu.Unlock()

	if s.prep == nil || s.prep.gen != gen {
		return
	}
	s.prep = nil
	s.prepError = msg
}

// prepIsCurrent reports whether gen still names the in-flight
// preparation.
func (s *server) prepIsCurrent(gen uint64) bool {
	s.prepMu.Lock()
	defer s.prepMu.Unlock()
	return s.prep != nil && s.prep.gen == gen
}

// cancelPrep abandons any in-flight preparation and clears the last
// failure. Called by DELETE /api/session, which is the one operation
// that means "forget about this attempt".
//
// It cannot stop the conductor's job, and does not try: seeding is an
// idempotent apply of setup.sh scripts, so the worst it leaves behind is
// a cluster prepared for questions nobody drew, which the next start
// seeds over and the next reset rebuilds away.
func (s *server) cancelPrep() {
	s.prepMu.Lock()
	defer s.prepMu.Unlock()

	s.prep = nil
	s.prepError = ""
	s.prepGen++
}

// prepSnapshot returns the in-flight preparation (nil when there is
// none) and the last failure message.
func (s *server) prepSnapshot() (*preparingInfo, string) {
	s.prepMu.Lock()
	defer s.prepMu.Unlock()

	if s.prep == nil {
		return nil, s.prepError
	}
	return &preparingInfo{
		JobID:         s.prep.jobID,
		Mode:          s.prep.mode,
		QuestionCount: len(s.prep.draw.QuestionIDs),
		StartedAt:     s.prep.startedAt.UTC().Format(time.RFC3339Nano),
		Seed:          s.prep.draw.Seed,
		PoolDigest:    s.prep.draw.PoolDigest,
	}, s.prepError
}
