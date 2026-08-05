package main

import (
	"encoding/json"
	"fmt"
	"log"
	"sync/atomic"
	"time"

	"kubestronaut-sim/facilitator/internal/evaluate"
	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/mcqgrade"
	"kubestronaut-sim/facilitator/internal/session"
)

// grader runs evaluate.Grade asynchronously and records its outcome on
// mgr via SetResults/SetGradeError. Its Grade method implements
// api.Grader and is also what main wires as the session's onExpire
// callback, so the same guarded logic backs both the "submit" and
// "auto-end at 0:00" paths.
//
// A CAS-guarded in-flight flag guards against two grading runs racing:
// the session-end HTTP handler and the expiry timer's onExpire
// callback can both observe the same running->ended transition (one
// wins the mutex inside session.Manager, the other sees the
// already-ended, not-yet-graded state and is allowed to re-grade per
// Manager.End's documented recovery semantics) and could otherwise both
// call Grade for the same session at nearly the same instant.
type grader struct {
	inFlight atomic.Bool

	ex      *exam.Exam
	bank    string
	mgr     *session.Manager
	runner  evaluate.Runner
	timeout time.Duration

	// record appends the graded attempt to the durable history, and is
	// nil in every run that keeps none (the tests, a dev run with no
	// state volume). It is invoked only after SetResults has succeeded,
	// so history records exactly what the candidate was shown, and its
	// error is logged rather than returned — see the call site.
	record func(token string, snap session.Snapshot, res *evaluate.Results) error
}

// newGrader returns a grader for ex, scoring against bank ex.Name (the
// bank id evaluate.Grade needs to build each check's remote command).
func newGrader(ex *exam.Exam, mgr *session.Manager, runner evaluate.Runner, timeout time.Duration) *grader {
	// ex is nil when no exam has been chosen. Nothing can be graded then —
	// there is no attempt to grade and no way to start one — so this is
	// constructed inert rather than not constructed at all, which keeps
	// the wiring below it identical in both cases.
	bank := ""
	if ex != nil {
		bank = ex.Name
	}
	return &grader{ex: ex, bank: bank, mgr: mgr, runner: runner, timeout: timeout}
}

// Grade kicks an asynchronous grading run unless one is already in
// flight, in which case it is a deliberate no-op: the in-progress run
// will still grade the (now further-confirmed) ended session, and
// starting a second concurrent evaluate.Grade against the same
// instances would only double the ssh load for no benefit.
func (g *grader) Grade() {
	if !g.inFlight.CompareAndSwap(false, true) {
		return
	}
	// Capture the attempt this run grades BEFORE any work happens: if the
	// operator resets (even reset + start + end of a whole new attempt)
	// while evaluate.Grade is running, the stale token makes every write
	// below a clean ErrConflict instead of stamping attempt A's outcome
	// onto attempt B.
	token := g.mgr.AttemptToken()
	go func() {
		defer g.inFlight.Store(false)
		// The design doc guarantees an evaluator failure never crashes
		// the facilitator (ssh unreachable, all-checks errors, or —
		// here — a bug that panics deep inside evaluate.Grade or a
		// Runner implementation). Without this recover, an unhandled
		// panic on this goroutine would take the whole process down;
		// recovering it and recording it as a gradeError keeps that
		// guarantee and lets a client re-POST end to retry.
		defer func() {
			if r := recover(); r != nil {
				if setErr := g.mgr.SetGradeError(token, fmt.Sprintf("grading panicked: %v", r)); setErr != nil {
					log.Printf("facilitator: record grade-panic failure: %v", setErr)
				}
			}
		}()

		res, snap, err := g.evaluateResults()
		if err != nil {
			// A refusal, not a crash: the attempt cannot be scored
			// honestly, and the candidate is told so on /api/results
			// rather than shown a confident number.
			if setErr := g.mgr.SetGradeError(token, err.Error()); setErr != nil {
				log.Printf("facilitator: record grade-refusal: %v", setErr)
			}
			return
		}
		data, err := json.Marshal(res)
		if err != nil {
			if setErr := g.mgr.SetGradeError(token, err.Error()); setErr != nil {
				log.Printf("facilitator: record grade-marshal failure: %v", setErr)
			}
			return
		}
		if err := g.mgr.SetResults(token, data); err != nil {
			if setErr := g.mgr.SetGradeError(token, err.Error()); setErr != nil {
				log.Printf("facilitator: record grade-results failure: %v", setErr)
			}
			return
		}

		// After SetResults, never before: history records what the
		// candidate was actually shown. And logged, never propagated — a
		// full state volume must not be able to turn a graded exam into a
		// grading failure, which is what returning this error here would
		// do.
		if g.record != nil {
			if err := g.record(token, snap, res); err != nil {
				log.Printf("facilitator: attempt not recorded in history: %v", err)
			}
		}
	}()
}

// PracticeGrade scores the environment as it stands right now and
// returns the result WITHOUT recording it anywhere.
//
// Deliberately non-persisted and synchronous. The alternative — routing
// it through SetResults — would mean relaxing checkGradeWriteLocked,
// which is the attempt-token guard the whole stale-write design rests
// on; a mid-attempt score would then be indistinguishable from the real
// one on /api/results, and a training run could overwrite a graded exam.
// So this touches no session state at all: it reads the cluster, returns
// JSON, and forgets.
//
// It shares inFlight with the real grader, so a "score my work" click
// cannot race a submit-triggered grade, and two impatient clicks cannot
// launch two ssh storms across every instance.
func (g *grader) PracticeGrade() (json.RawMessage, error) {
	if !g.inFlight.CompareAndSwap(false, true) {
		return nil, fmt.Errorf("a grading run is already in progress")
	}
	defer g.inFlight.Store(false)

	res, _, err := g.evaluateResults()
	if err != nil {
		return nil, err
	}
	raw, err := json.Marshal(res)
	if err != nil {
		return nil, fmt.Errorf("marshal practice results: %w", err)
	}
	return raw, nil
}

// evaluateResults returns the graded Results for the active exam, and
// the session snapshot it graded — the attempt's own description, which
// the history recorder needs and which must be the one this run read
// rather than whatever the session says a moment later.
//
// It produces those Results by
// whichever engine it belongs to: hands-on runs the ssh checks against
// the cluster; mcq scores the session's stored answers, pure and
// instant. Both return the same schema, which is why everything
// downstream of this call is engine-agnostic, and both are scoped to the
// attempt's drawn question ids rather than to the whole bank.
//
// It refuses outright when the attempt's pool digest no longer describes
// the loaded bank. exam.Subset SILENTLY SKIPS ids the exam does not
// declare, so a session whose drawn ids outlived their bank would
// otherwise be scored on the intersection and reported with a plausible,
// wrong Total — a candidate would read a confident score for an exam
// they did not sit. An error message is the better outcome, and making
// Subset intolerant instead would break the every-question-in-bank-order
// path every unpooled attempt takes.
func (g *grader) evaluateResults() (*evaluate.Results, session.Snapshot, error) {
	snap := g.mgr.Snapshot()
	if err := exam.CheckPool(g.ex, snap.PoolDigest); err != nil {
		return nil, snap, err
	}

	var res *evaluate.Results
	if g.ex.Type == exam.TypeMCQ {
		res = mcqgrade.Grade(g.ex, g.bank, g.mgr.Answers(), g.mgr.QuestionIDs())
	} else {
		res = evaluate.Grade(g.ex, g.bank, g.runner, g.timeout, g.mgr.QuestionIDs())
	}
	res.Describe(g.ex, evaluate.Attempt{
		Mode:            snap.Mode,
		Seed:            snap.Seed,
		DomainFilter:    snap.DomainFilter,
		DurationSeconds: snap.DurationSeconds,
		ElapsedSeconds:  snap.ElapsedSeconds,
		TimeSpent:       g.mgr.TimeSpent(),
	})
	return res, snap, nil
}
