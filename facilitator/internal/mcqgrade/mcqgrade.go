package mcqgrade

import (
	"fmt"
	"strings"
	"time"

	"kubestronaut-sim/facilitator/internal/evaluate"
	"kubestronaut-sim/facilitator/internal/exam"
)

const checkName = "answer"

func Grade(ex *exam.Exam, bank string, answers map[string][]int, questionIDs []string) *evaluate.Results {
	res := &evaluate.Results{
		Bank:         bank,
		GradedAt:     time.Now(),
		PassingScore: ex.PassingScore,
	}

	for _, q := range exam.Subset(ex, questionIDs) {
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
			Title:    q.Title,
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
	}

	res.Finalize(ex.Domains)
	return res
}

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

func message(selected, correct []int) string {
	if len(selected) == 0 {
		return fmt.Sprintf("no answer — correct %s", letters(correct))
	}
	return fmt.Sprintf("selected %s — correct %s", letters(selected), letters(correct))
}

func letters(indices []int) string {
	out := make([]string, len(indices))
	for i, n := range indices {
		out[i] = string(rune('A' + n))
	}
	return strings.Join(out, ", ")
}
