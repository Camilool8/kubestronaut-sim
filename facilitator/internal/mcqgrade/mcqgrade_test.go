package mcqgrade

import (
	"strings"
	"testing"

	"kubestronaut-sim/facilitator/internal/exam"
)

func fixtureExam() *exam.Exam {
	return &exam.Exam{
		Name:         "kcna-fixture",
		Type:         exam.TypeMCQ,
		PassingScore: 75,
		Questions: []exam.Question{
			{
				ID: "q01", Domain: "Kubernetes Fundamentals", Weight: 1,
				Options: []string{"The kubelet", "The kube-scheduler", "The kube-apiserver", "etcd"},
				Correct: []int{2},
			},
			{
				ID: "q02", Domain: "Container Orchestration", Weight: 2, Multi: true,
				Options: []string{"CNI", "CSI", "SMI", "CRI"},
				Correct: []int{0, 3},
			},
			{
				ID: "q03", Domain: "Kubernetes Fundamentals", Weight: 1,
				Options: []string{"One", "Two", "Three"},
				Correct: []int{1},
			},
		},
	}
}

func TestGradeAllCorrect(t *testing.T) {
	res := Grade(fixtureExam(), "kcna-fixture", map[string][]int{
		"q01": {2},
		"q02": {0, 3},
		"q03": {1},
	})

	if res.Total != 4 {
		t.Errorf("Total = %d, want 4", res.Total)
	}
	if res.Earned != 4 {
		t.Errorf("Earned = %d, want 4", res.Earned)
	}
	if res.Percent != 100 {
		t.Errorf("Percent = %d, want 100", res.Percent)
	}
	if !res.Passed {
		t.Errorf("Passed = false, want true")
	}
	if res.Bank != "kcna-fixture" {
		t.Errorf("Bank = %q, want kcna-fixture", res.Bank)
	}
	if res.GradedAt.IsZero() {
		t.Errorf("GradedAt is zero, want stamped")
	}
}

func TestGradeBlankScoresZero(t *testing.T) {
	res := Grade(fixtureExam(), "kcna-fixture", nil)

	if res.Earned != 0 {
		t.Errorf("Earned = %d, want 0", res.Earned)
	}
	if res.Percent != 0 {
		t.Errorf("Percent = %d, want 0", res.Percent)
	}
	if res.Passed {
		t.Errorf("Passed = true, want false")
	}
	// An unanswered question must say so, not show an empty selection.
	msg := res.Questions[0].Checks[0].Message
	if !strings.Contains(msg, "no answer") {
		t.Errorf("unanswered message = %q, want it to mention 'no answer'", msg)
	}
}

// Multi-select is all-or-nothing: a subset, a superset, or a swap of the
// correct set all earn zero.
func TestGradeMultiAllOrNothing(t *testing.T) {
	cases := []struct {
		name     string
		selected []int
		want     int
	}{
		{"exact", []int{0, 3}, 2},
		{"subset", []int{0}, 0},
		{"superset", []int{0, 1, 3}, 0},
		{"disjoint", []int{1, 2}, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			res := Grade(fixtureExam(), "b", map[string][]int{"q02": c.selected})
			q02 := res.Questions[1]
			if q02.Earned != c.want {
				t.Errorf("q02.Earned = %d, want %d", q02.Earned, c.want)
			}
			if got := q02.Checks[0].Passed; got != (c.want > 0) {
				t.Errorf("q02 Passed = %v, want %v", got, c.want > 0)
			}
		})
	}
}

func TestGradeResultShapeCarriesReviewFields(t *testing.T) {
	res := Grade(fixtureExam(), "b", map[string][]int{"q01": {0}})
	q01 := res.Questions[0]

	if len(q01.Options) != 4 {
		t.Errorf("q01.Options = %v, want the 4 option texts", q01.Options)
	}
	if len(q01.Correct) != 1 || q01.Correct[0] != 2 {
		t.Errorf("q01.Correct = %v, want [2]", q01.Correct)
	}
	if len(q01.Selected) != 1 || q01.Selected[0] != 0 {
		t.Errorf("q01.Selected = %v, want [0]", q01.Selected)
	}
	if q01.Instance != "" {
		t.Errorf("q01.Instance = %q, want empty for mcq", q01.Instance)
	}
	if len(q01.Checks) != 1 || q01.Checks[0].Name != "answer" {
		t.Errorf("q01.Checks = %+v, want one synthetic 'answer' check", q01.Checks)
	}
	if q01.Total != 1 || q01.Checks[0].Points != 1 {
		t.Errorf("q01 totals = (%d, %d), want weight 1 on both", q01.Total, q01.Checks[0].Points)
	}
	// Messages speak in option letters, the language of the review UI.
	msg := q01.Checks[0].Message
	if !strings.Contains(msg, "A") || !strings.Contains(msg, "C") {
		t.Errorf("message = %q, want selected letter A and correct letter C", msg)
	}

	q02 := res.Questions[1]
	if !q02.Multi {
		t.Errorf("q02.Multi = false, want true")
	}
}

func TestGradePercentMath(t *testing.T) {
	// 3 of 4 points → 75%, exactly the passing score.
	res := Grade(fixtureExam(), "b", map[string][]int{
		"q02": {0, 3},
		"q03": {1},
	})
	if res.Percent != 75 {
		t.Errorf("Percent = %d, want 75", res.Percent)
	}
	if !res.Passed {
		t.Errorf("Passed = false, want true at exactly the passing score")
	}
}

func TestLetters(t *testing.T) {
	if got := letters([]int{0, 2, 3}); got != "A, C, D" {
		t.Errorf("letters([0 2 3]) = %q, want %q", got, "A, C, D")
	}
	if got := letters(nil); got != "" {
		t.Errorf("letters(nil) = %q, want empty", got)
	}
}
