package evaluate

import (
	"testing"

	"kubestronaut-sim/facilitator/internal/exam"
)

func levelResults(qs ...QuestionResult) *Results {
	r := &Results{Questions: qs}
	r.Finalize(nil)
	return r
}

func q(id, domain, tier string, earned, total int) QuestionResult {
	return QuestionResult{ID: id, Domain: domain, Difficulty: tier, Earned: earned, Total: total}
}

func TestLevelsReadShortestFirstWhateverOrderTheQuestionsCame(t *testing.T) {
	r := levelResults(
		q("q1", "A", exam.TierDeep, 2, 10),
		q("q2", "A", exam.TierQuick, 5, 5),
		q("q3", "B", exam.TierCore, 4, 8),
		q("q4", "B", exam.TierQuick, 4, 5),
	)

	want := []LevelResult{
		{Level: exam.TierQuick, Earned: 9, Total: 10, QuestionCount: 2},
		{Level: exam.TierCore, Earned: 4, Total: 8, QuestionCount: 1},
		{Level: exam.TierDeep, Earned: 2, Total: 10, QuestionCount: 1},
	}
	if len(r.Levels) != len(want) {
		t.Fatalf("Levels = %+v, want %d entries", r.Levels, len(want))
	}
	for i, w := range want {
		if r.Levels[i] != w {
			t.Errorf("Levels[%d] = %+v, want %+v", i, r.Levels[i], w)
		}
	}
}

// The shape is the whole point: a score that falls away as tasks get longer is
// a different problem from one that is flat and low.
func TestLevelsKeepTierOrderRatherThanScoreOrder(t *testing.T) {
	r := levelResults(
		q("q1", "A", exam.TierQuick, 0, 10),
		q("q2", "A", exam.TierDeep, 10, 10),
	)
	if len(r.Levels) != 2 || r.Levels[0].Level != exam.TierQuick || r.Levels[1].Level != exam.TierDeep {
		t.Fatalf("Levels = %+v, want quick before deep even when quick scored worse", r.Levels)
	}
}

// kcna-mock and the smoke banks declare no tiers; they must get no breakdown
// rather than one bucket labelled with the empty string.
func TestLevelsAbsentWhenTheBankDeclaresNoTiers(t *testing.T) {
	r := levelResults(
		QuestionResult{ID: "q1", Domain: "A", Earned: 1, Total: 1},
		QuestionResult{ID: "q2", Domain: "A", Earned: 0, Total: 1},
	)
	if r.Levels != nil {
		t.Errorf("Levels = %+v, want nil for a bank that declares no tiers", r.Levels)
	}
}

func TestLevelsCoverOnlyTheTiersTheAttemptDrew(t *testing.T) {
	r := levelResults(q("q1", "A", exam.TierCore, 3, 6))
	if len(r.Levels) != 1 || r.Levels[0].Level != exam.TierCore {
		t.Fatalf("Levels = %+v, want only the core tier", r.Levels)
	}
}

func TestLevelTotalsAgreeWithTheAttemptTotal(t *testing.T) {
	r := levelResults(
		q("q1", "A", exam.TierQuick, 3, 5),
		q("q2", "B", exam.TierCore, 6, 9),
		q("q3", "B", exam.TierDeep, 1, 7),
	)
	earned, total := 0, 0
	for _, l := range r.Levels {
		earned += l.Earned
		total += l.Total
	}
	if earned != r.Earned || total != r.Total {
		t.Errorf("levels sum to %d/%d, attempt is %d/%d — a breakdown that does not add up is worse than none",
			earned, total, r.Earned, r.Total)
	}
}
