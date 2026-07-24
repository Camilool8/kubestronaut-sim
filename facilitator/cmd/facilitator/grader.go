package main

import (
	"encoding/json"
	"fmt"
	"log"
	"sync/atomic"
	"time"

	"kubestronaut-sim/facilitator/internal/evaluate"
	"kubestronaut-sim/facilitator/internal/exam"
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
}

// newGrader returns a grader for ex, scoring against bank ex.Name (the
// bank id evaluate.Grade needs to build each check's remote command).
func newGrader(ex *exam.Exam, mgr *session.Manager, runner evaluate.Runner, timeout time.Duration) *grader {
	return &grader{ex: ex, bank: ex.Name, mgr: mgr, runner: runner, timeout: timeout}
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

		res := evaluate.Grade(g.ex, g.bank, g.runner, g.timeout)
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
		}
	}()
}
