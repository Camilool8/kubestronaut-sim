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

// errClusterHoldsAnotherDraw refuses to seed a second draw into a
// cluster still holding the first. Mapped to 409, like every other
// start refusal: it is a conflict with state that exists, and the
// message names the operation that resolves it.
var errClusterHoldsAnotherDraw = errors.New("the exam environment is still set up for an earlier attempt's questions; reset the environment before starting a different attempt")

// errPreparationLost reports, after the fact, that an attempt was being
// prepared when this process went away. It rides prepareError, which the
// client already renders. See probeSeeded.
var errPreparationLost = errors.New("the exam service restarted while an attempt's environment was being prepared, and that attempt cannot be resumed — reset the environment before starting a new one")

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
// facilitator restart during preparation therefore abandons it — the
// draw is gone with the process that made it and no attempt can be
// resumed from it. What the restart must NOT do is abandon it in
// silence, which is what probeSeeded is for.
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
	// No exam, nothing to seed. Called from New before any request, so
	// this has to hold at construction as well as per attempt.
	if s.ex == nil {
		return false
	}
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
	// From here the cluster is being written to, and stays written to
	// whatever happens next: a cancelled preparation, a failed one, or a
	// seed job that dies half way still leaves objects behind. So this is
	// recorded on the job being ACCEPTED rather than on it succeeding —
	// the question this answers is "what is in the cluster", not "what
	// worked".
	s.markSeeded(draw.QuestionIDs)

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
// It cannot stop the conductor's job, and does not try. What it
// deliberately does NOT do is forget what that job put in the cluster:
// the seeded set outlives the preparation that asked for it, because the
// objects do. Forgetting here is precisely the defect checkClusterFree
// exists to close — DELETE followed by a fresh start used to seed a
// second draw on top of the first.
func (s *server) cancelPrep() {
	s.prepMu.Lock()
	defer s.prepMu.Unlock()

	s.prep = nil
	s.prepError = ""
	s.prepGen++
}

// seededSet is what the exam cluster is known to be holding: the
// questions some seed job has already run setup.sh for, since the last
// time the environment was rebuilt.
//
// In memory, like prep, but for a different reason: this describes the
// CLUSTER, and a note about the cluster written into the facilitator's
// session file would be a claim this process cannot keep true — a reset,
// a `./sim down`, a rebuild triggered by anything at all changes the fact
// without touching the file. What it can do instead is be honest about
// how much it knows, which is what ids/named below are for. It does not
// need persisting to survive a restart either: an attempt's own drawn
// questions ARE what its seeding created, and those are persisted with
// the session (see New).
type seededSet struct {
	// ids is the seeded question ids, sorted, so a draw is compared by
	// the set it is rather than the order it happens to be in — the
	// cluster cannot tell the difference and neither should this.
	ids []string
	// named is false when the cluster holds a draw this process cannot
	// enumerate (see probeSeeded). Such a set matches nothing: "there is
	// something in there and I do not know what" is a reason to rebuild,
	// never a reason to proceed.
	named bool
}

// newSeededSet records ids as the cluster's contents.
func newSeededSet(ids []string) *seededSet {
	sorted := append([]string(nil), ids...)
	sort.Strings(sorted)
	return &seededSet{ids: sorted, named: true}
}

// matches reports whether ids is exactly the set already seeded. A nil
// set is a cluster nothing has been seeded into, which anything may be
// seeded into.
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

// checkClusterFree refuses to prepare ids in a cluster that is already
// prepared for something else.
//
// The defect it closes: seeding runs each drawn question's setup.sh and
// nothing anywhere runs a teardown, so DELETE /api/session followed by a
// fresh POST /api/session/start — which starts a new attempt without
// rebuilding anything — seeds draw B over every object draw A created.
// Grading is scoped to B, so the SCORE stays honest; the exam does not.
// A candidate can be handed a task that is already half done, a
// namespace that already exists, or a Service that fails for a reason
// nothing on their screen explains. The UI never reaches this (its "New
// attempt" resets the environment first), the API does.
//
// Refusing is the whole fix, and the trade-off accepted with it is that
// the facilitator does not clean up: it can ask the conductor to CREATE
// cluster state and has no way to remove it, so the only honest answer
// is to name the operation that does and stop. The error is a 409 with
// that instruction in it.
//
// An identical set is allowed straight through, because re-running the
// same setup.sh scripts over their own output is the idempotent apply
// the conductor's seed job already is. That is what keeps "the seeding
// failed, start again with the same seed" a retry rather than a second
// refusal.
func (s *server) checkClusterFree(ids []string) error {
	s.prepMu.Lock()
	defer s.prepMu.Unlock()

	if s.seeded.matches(ids) {
		return nil
	}
	return errClusterHoldsAnotherDraw
}

// markSeeded records ids as the cluster's contents.
func (s *server) markSeeded(ids []string) {
	s.prepMu.Lock()
	defer s.prepMu.Unlock()
	s.seeded = newSeededSet(ids)
}

// clearSeeded records that the cluster has been rebuilt and holds
// nothing.
func (s *server) clearSeeded() {
	s.prepMu.Lock()
	defer s.prepMu.Unlock()
	s.seeded = nil
}

// controlProxy is the conductor passthrough, wrapped so this server sees
// the operations that empty the exam cluster.
//
// Watching the proxy is how the facilitator learns a rebuild happened,
// and it is not a shortcut: the conductor's job store is unreachable
// from this process except through this handler, and a rebuilt cluster
// leaves no trace in the session file. Every reset in the product does
// come through here — the UI's "New attempt" and `./sim reset` both POST
// to /api/control/reset on :8080, the conductor being reachable from
// nowhere else — so this sees all of them.
//
// The trade-off: the seeded set is dropped when the job is ACCEPTED, not
// when it finishes, because nothing reports the finish back to this
// process. A reset that is accepted and then fails therefore stands the
// guard down over a cluster that may still be dirty. That direction is
// deliberate. The guard's own error tells a candidate to reset, so a
// guard their reset could not clear would be one no action of theirs
// could ever clear — and a start during the rebuild itself is refused
// twice over anyway, by the boot gate and by the conductor's single-job
// lock.
func (s *server) controlProxy() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rebuildsCluster(r) {
			s.control.ServeHTTP(w, r)
			return
		}
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		s.control.ServeHTTP(rec, r)
		// Only on the conductor's acceptance: a 409 (a job already in
		// flight) or a 400 changed nothing about the cluster.
		if rec.status >= 200 && rec.status < 300 {
			s.clearSeeded()
		}
	})
}

// rebuildsCluster reports whether r is a request for one of the two
// conductor operations that recreate the cluster. A switch qualifies as
// much as a reset: it re-bootstraps for the incoming bank.
func rebuildsCluster(r *http.Request) bool {
	if r.Method != http.MethodPost {
		return false
	}
	return r.URL.Path == "/api/control/reset" || r.URL.Path == "/api/control/switch"
}

// statusRecorder notes the status a handler wrote, and is otherwise the
// ResponseWriter it wraps. Unwrap keeps http.ResponseController working
// through it, which the reverse proxy underneath uses to flush.
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

// startSeedProbe runs probeSeeded once per process, off the request
// goroutine that triggered it.
func (s *server) startSeedProbe() {
	if !s.seedRequired() || s.control == nil {
		return
	}
	s.probeOnce.Do(func() { go s.probeSeeded() })
}

// probeSeeded asks the conductor whether the cluster was seeded for an
// attempt this process knows nothing about, and says so if it was.
//
// The gap it closes: a preparation lives in memory (see prep), so a
// facilitator that restarts mid-preparation comes back with an idle
// session, no `preparing`, no error, and a candidate watching a poller
// that will never change again. The attempt itself cannot be recovered —
// the draw died with the process — but the situation can be stated, and
// a stated dead end is a different thing from a hang.
//
// The signal is the conductor's own job store: a SEED job that is
// running, or that ran and was never displaced by a reset, against a
// session here that is idle. The session file is what makes that
// unambiguous rather than merely suggestive — a preparation that had
// succeeded would have started an attempt, and an attempt is persisted.
// So an idle session plus a seed job means the seeding was done for an
// attempt that no longer exists.
//
// Best-effort throughout, and silent when it cannot tell: an unreachable
// conductor, an old build, a status shape it cannot parse all leave the
// old silent behaviour exactly as it was, which is the worst this can do
// and is no worse than not being here.
func (s *server) probeSeeded() {
	// The reverse proxy underneath aborts a failed copy by panicking with
	// http.ErrAbortHandler, which is a server's business and not this
	// goroutine's — recovering keeps a conductor that hangs up mid-answer
	// from taking the facilitator with it.
	defer func() { _ = recover() }()

	// Only ever true before this process has begun a preparation of its
	// own: prepGen counts them, so a nonzero one means any seed job the
	// conductor is holding is this process's, and there is nothing to
	// reconcile.
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
	// Re-checked under the lock, because asking the conductor took a round
	// trip and a start may have begun during it. Writing either half after
	// that would be this goroutine reporting on a preparation that is
	// alive and well, and clobbering the seeded set that start just
	// recorded.
	if s.prepGen != 0 || s.prep != nil || s.prepError != "" {
		return
	}
	log.Printf("facilitator: %v", errPreparationLost)
	// Both halves of the answer. The message is for the candidate, who
	// would otherwise be told nothing at all; the unknown seeded set is
	// for the next start, which must not seed a fresh draw into whatever
	// that job created — the one thing this process cannot enumerate.
	s.seeded = &seededSet{}
	s.prepError = errPreparationLost.Error()
}

// conductorHeldSeedJob reports whether the conductor's in-flight or last
// job is a seed.
//
// It goes through the same proxy handler the browser's control requests
// take, because that handler IS this process's only route to the
// conductor — the address it points at is main's to know, not this
// package's.
func (s *server) conductorHeldSeedJob() bool {
	ctx, cancel := context.WithTimeout(context.Background(), prepPollTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "/api/control/status", nil)
	if err != nil {
		return false
	}
	rec := &bodyRecorder{header: http.Header{}, status: http.StatusOK}
	s.control.ServeHTTP(rec, req)
	if rec.status != http.StatusOK {
		return false
	}

	// Only the two fields that matter; the conductor's job record carries
	// a dozen more and none of them changes this answer.
	var snap struct {
		Job *struct {
			Op string `json:"op"`
		} `json:"job"`
		LastJob *struct {
			Op string `json:"op"`
		} `json:"lastJob"`
	}
	if err := json.Unmarshal(rec.body.Bytes(), &snap); err != nil {
		return false
	}
	if snap.Job != nil && snap.Job.Op == seedJobOp {
		return true
	}
	// A settled seed job counts as much as a running one: the seeding may
	// simply have finished while this process was away, and the objects
	// it made are just as present. A reset or a switch since then would
	// have displaced it — the store keeps exactly one last job — which is
	// what stops this firing on the ordinary post-attempt path.
	return snap.LastJob != nil && snap.LastJob.Op == seedJobOp
}

// seedJobOp is the conductor's name for a seeding job (job.Job.Op).
const seedJobOp = "seed"

// bodyRecorder captures a handler's whole response in memory. The
// conductor's status body is a few hundred bytes and this is called once
// per process.
type bodyRecorder struct {
	header http.Header
	body   bytes.Buffer
	status int
}

func (w *bodyRecorder) Header() http.Header         { return w.header }
func (w *bodyRecorder) WriteHeader(status int)      { w.status = status }
func (w *bodyRecorder) Write(b []byte) (int, error) { return w.body.Write(b) }

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
