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

type grader struct {
	inFlight atomic.Bool

	ex      *exam.Exam
	bank    string
	mgr     *session.Manager
	runner  evaluate.Runner
	timeout time.Duration

	record func(token string, snap session.Snapshot, res *evaluate.Results) error
}

func newGrader(ex *exam.Exam, mgr *session.Manager, runner evaluate.Runner, timeout time.Duration) *grader {

	bank := ""
	if ex != nil {
		bank = ex.Name
	}
	return &grader{ex: ex, bank: bank, mgr: mgr, runner: runner, timeout: timeout}
}

func (g *grader) Grade() {
	if !g.inFlight.CompareAndSwap(false, true) {
		return
	}

	token := g.mgr.AttemptToken()
	go func() {
		defer g.inFlight.Store(false)

		defer func() {
			if r := recover(); r != nil {
				if setErr := g.mgr.SetGradeError(token, fmt.Sprintf("grading panicked: %v", r)); setErr != nil {
					log.Printf("facilitator: record grade-panic failure: %v", setErr)
				}
			}
		}()

		res, snap, err := g.evaluateResults()
		if err != nil {

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

		if g.record != nil {
			if err := g.record(token, snap, res); err != nil {
				log.Printf("facilitator: attempt not recorded in history: %v", err)
			}
		}
	}()
}

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
