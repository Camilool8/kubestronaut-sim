package mcqgrade_test

import (
	"strings"
	"testing"

	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/mcqgrade"
)

const i18nBank = "../api/testdata/bank-mcq-i18n"

func TestGradeInWritesTheReviewInTheAttemptLanguage(t *testing.T) {
	ex, err := exam.Load("../api/testdata/exam-mcq-i18n.json", i18nBank)
	if err != nil {
		t.Fatal(err)
	}
	answers := map[string][]int{"q01": {1}, "q02": {0, 2}}

	res := mcqgrade.GradeIn(ex, ex.Name, answers, []string{"q01", "q02"}, i18nBank, "pt")
	if res.Questions[0].Earned != 1 || res.Questions[1].Earned != 1 {
		t.Fatalf("scoring changed with the language: %+v", res.Questions)
	}
	if got := strings.Join(res.Questions[0].Options, "|"); got != "Alfa|Bravo|Charlie" {
		t.Errorf("q01 options = %q, want the pt options", got)
	}

	// The base language, asked for explicitly or by omission, is exam.yaml's text.
	for _, lang := range []string{"", "en"} {
		res := mcqgrade.GradeIn(ex, ex.Name, answers, []string{"q01"}, i18nBank, lang)
		if got := strings.Join(res.Questions[0].Options, "|"); got != "Alpha|Bravo|Charlie" {
			t.Errorf("lang %q: q01 options = %q, want exam.yaml's", lang, got)
		}
	}

	// A translation that cannot be read must not cost the candidate the
	// grade: the review falls back to the bank's own text for that question.
	res = mcqgrade.GradeIn(ex, ex.Name, answers, []string{"q01"}, t.TempDir(), "pt")
	if res.Questions[0].Earned != 1 || res.Questions[0].Options[0] != "Alpha" {
		t.Errorf("unreadable translation: %+v", res.Questions[0])
	}
}
