// Package mcqgrade grades a multiple-choice attempt: the candidate's
// stored selections against the exam's answer key.
//
// It deliberately emits the same Results shape as internal/evaluate — one
// synthetic "answer" check per question — so session persistence,
// /api/results, the score page's polling loop, and Scoreboard all work
// unchanged for both engines. Unlike evaluate.Grade it is pure: no
// cluster, no ssh, no timeouts — grading is a set comparison.
package mcqgrade

import (
	"fmt"
	"strings"
	"time"

	"kubestronaut-sim/facilitator/internal/evaluate"
	"kubestronaut-sim/facilitator/internal/exam"
)

// checkName is the synthetic check every mcq question reports. The score
// page never shows it (it renders the answer review instead), but the
// Scoreboard text and any JSON consumer see a stable name.
const checkName = "answer"

// Grade scores answers (qid → selected option indices, sorted, as
// session.Manager.Answers returns them) against ex's key. Scoring is
// all-or-nothing per question: earned = weight iff the selected set
// equals the correct set. An unanswered question earns zero.
//
// questionIDs is the attempt's drawn subset (session.Manager.QuestionIDs)
// — a pooled mcq attempt is graded on exactly those questions, in that
// order, never the full pool. Empty means "no pooling": every question
// in ex.Questions, exactly as this package graded before pooling existed.
func Grade(ex *exam.Exam, bank string, answers map[string][]int, questionIDs []string) *evaluate.Results {
	res := &evaluate.Results{
		Bank:         bank,
		GradedAt:     time.Now(),
		PassingScore: ex.PassingScore,
	}

	questions := ex.Questions
	if len(questionIDs) > 0 {
		byID := make(map[string]exam.Question, len(ex.Questions))
		for _, q := range ex.Questions {
			byID[q.ID] = q
		}
		questions = make([]exam.Question, 0, len(questionIDs))
		for _, id := range questionIDs {
			if q, ok := byID[id]; ok {
				questions = append(questions, q)
			}
		}
	}

	for _, q := range questions {
		selected := answers[q.ID]
		passed := len(selected) > 0 && equal(selected, q.Correct)

		cr := evaluate.CheckResult{
			Name:    checkName,
			Desc:    "Correct answer selected",
			Points:  q.Weight,
			Passed:  passed,
			Message: message(selected, q.Correct),
		}
		if passed {
			cr.Earned = q.Weight
		}

		qr := evaluate.QuestionResult{
			ID:       q.ID,
			Domain:   q.Domain,
			Earned:   cr.Earned,
			Total:    q.Weight,
			Checks:   []evaluate.CheckResult{cr},
			Selected: selected,
			Correct:  q.Correct,
			Options:  q.Options,
			Multi:    q.Multi,
		}

		res.Questions = append(res.Questions, qr)
		res.Total += qr.Total
		res.Earned += qr.Earned
	}

	if res.Total > 0 {
		res.Percent = res.Earned * 100 / res.Total
	}
	res.Passed = res.Percent >= res.PassingScore

	return res
}

// equal reports whether two sorted index slices are the same set.
func equal(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// message renders the graded outcome in option letters — "selected A —
// correct C" — the same language the review UI speaks.
func message(selected, correct []int) string {
	if len(selected) == 0 {
		return fmt.Sprintf("no answer — correct %s", letters(correct))
	}
	return fmt.Sprintf("selected %s — correct %s", letters(selected), letters(correct))
}

// letters formats option indices as "A, C, D".
func letters(indices []int) string {
	out := make([]string, len(indices))
	for i, n := range indices {
		out[i] = string(rune('A' + n))
	}
	return strings.Join(out, ", ")
}
