package mcqgrade

import (
	"reflect"
	"strings"
	"testing"

	"kubestronaut-sim/facilitator/internal/evaluate"
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
	}, nil)

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
	res := Grade(fixtureExam(), "kcna-fixture", nil, nil)

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
			res := Grade(fixtureExam(), "b", map[string][]int{"q02": c.selected}, nil)
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
	res := Grade(fixtureExam(), "b", map[string][]int{"q01": {0}}, nil)
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
	}, nil)
	if res.Percent != 75 {
		t.Errorf("Percent = %d, want 75", res.Percent)
	}
	if !res.Passed {
		t.Errorf("Passed = false, want true at exactly the passing score")
	}
}

// A pooled attempt is graded on exactly its drawn subset: an answer to a
// pool question outside that subset must not appear in the results or
// count toward the total, and the subset's own order is what Questions
// comes back in — not the pool's.
func TestGradeScopesToQuestionIDs(t *testing.T) {
	res := Grade(fixtureExam(), "b", map[string][]int{
		"q01": {2},
		"q02": {0, 3},
		"q03": {1},
	}, []string{"q03", "q01"})

	if len(res.Questions) != 2 {
		t.Fatalf("len(Questions) = %d, want 2 (only the drawn subset)", len(res.Questions))
	}
	if res.Questions[0].ID != "q03" || res.Questions[1].ID != "q01" {
		t.Errorf("Questions ids = [%s %s], want [q03 q01] (subset order preserved)",
			res.Questions[0].ID, res.Questions[1].ID)
	}
	// q02 carried 2 of the 4 total points; excluded from the draw, it
	// must not inflate Total either.
	if res.Total != 2 {
		t.Errorf("Total = %d, want 2 (q02's weight excluded)", res.Total)
	}
	if res.Earned != 2 {
		t.Errorf("Earned = %d, want 2 (q01 and q03 both correct)", res.Earned)
	}
}

// The fixture's points do not sit in the curriculum's ratios —
// Fundamentals holds 2 of 4 points but 75% of the curriculum — which is
// exactly the shape a pooled draw produces, and exactly what weighting at
// scoring time is for.
func weightedFixture() *exam.Exam {
	ex := fixtureExam()
	ex.Domains = []exam.Domain{
		{Name: "Kubernetes Fundamentals", WeightPct: 75},
		{Name: "Container Orchestration", WeightPct: 25},
	}
	return ex
}

func TestGradeWeightsByCurriculumDomain(t *testing.T) {
	// Both Fundamentals questions right, the Orchestration one wrong.
	res := Grade(weightedFixture(), "b", map[string][]int{
		"q01": {2},
		"q03": {1},
	}, nil)

	if res.Percent != 75 {
		t.Errorf("Percent = %d, want 75 (all of Fundamentals, none of Orchestration)", res.Percent)
	}
	if res.PointsPercent != 50 {
		t.Errorf("PointsPercent = %d, want 50 (2 of 4 points)", res.PointsPercent)
	}
	if !res.Passed {
		t.Errorf("Passed = false, want true — 75 is exactly the passing score")
	}
}

func TestGradeDomainRollupAndVerdicts(t *testing.T) {
	res := Grade(weightedFixture(), "b", map[string][]int{
		"q01": {2},
		"q02": {0},
	}, nil)

	want := []evaluate.DomainResult{
		{Domain: "Kubernetes Fundamentals", Earned: 1, Total: 2, WeightPct: 75, QuestionCount: 2},
		{Domain: "Container Orchestration", Earned: 0, Total: 2, WeightPct: 25, QuestionCount: 1},
	}
	if !reflect.DeepEqual(res.Domains, want) {
		t.Errorf("Domains = %+v, want %+v", res.Domains, want)
	}

	// mcq is all-or-nothing, so a question is only ever correct or
	// failed — never partial, even the 2-point multi-select.
	for i, w := range []string{evaluate.VerdictCorrect, evaluate.VerdictFailed, evaluate.VerdictFailed} {
		if got := res.Questions[i].Verdict; got != w {
			t.Errorf("Questions[%d].Verdict = %q, want %q", i, got, w)
		}
	}
	// Fundamentals' 75 points split evenly over its two 1-point
	// questions; Orchestration's 25 all sit on its one question.
	for i, w := range []float64{37.5, 25, 37.5} {
		if got := res.Questions[i].WeightPct; got != w {
			t.Errorf("Questions[%d].WeightPct = %v, want %v", i, got, w)
		}
	}
}

// A draw that misses a domain entirely renormalizes over what it drew:
// the missing domain's weight cannot be earned, so it must not be in the
// denominator either — otherwise a 65-question draw would cap below 100%.
func TestGradeRenormalizesOverTheDrawnDomains(t *testing.T) {
	res := Grade(weightedFixture(), "b", map[string][]int{
		"q02": {0, 3},
	}, []string{"q02"})

	if len(res.Domains) != 1 || res.Domains[0].Domain != "Container Orchestration" {
		t.Fatalf("Domains = %+v, want only the drawn Orchestration domain", res.Domains)
	}
	if res.Domains[0].WeightPct != 100 {
		t.Errorf("WeightPct = %v, want 100 (the only domain drawn)", res.Domains[0].WeightPct)
	}
	if res.Percent != 100 {
		t.Errorf("Percent = %d, want 100 — every question drawn was answered correctly", res.Percent)
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
