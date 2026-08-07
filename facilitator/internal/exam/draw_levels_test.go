package exam

import (
	"fmt"
	"strings"
	"testing"
)

var ckadDomainOrder = []string{
	"Application Environment, Configuration and Security",
	"Application Deployment",
	"Services and Networking",
	"Application Design and Build",
	"Application Observability and Maintenance",
}

var ckadWeights = map[string]int{
	"Application Environment, Configuration and Security": 25,
	"Application Deployment":                              20,
	"Services and Networking":                             20,
	"Application Design and Build":                        20,
	"Application Observability and Maintenance":           15,
}

var ckadMix = map[string]int{TierQuick: 30, TierCore: 45, TierDeep: 25}

// The shape branch 2+ is authoring towards: 44 questions drawing 17.
var ckadTierPools = map[string]map[string]int{
	"Application Environment, Configuration and Security": {TierQuick: 3, TierCore: 4, TierDeep: 3},
	"Application Deployment":                              {TierQuick: 3, TierCore: 4, TierDeep: 3},
	"Services and Networking":                             {TierQuick: 2, TierCore: 4, TierDeep: 2},
	"Application Design and Build":                        {TierQuick: 2, TierCore: 4, TierDeep: 2},
	"Application Observability and Maintenance":           {TierQuick: 2, TierCore: 4, TierDeep: 2},
}

func levelFixture(t *testing.T, tierPools map[string]map[string]int, mix map[string]int, examLength int) *Exam {
	t.Helper()
	e := &Exam{
		Type:          TypeMCQ,
		DomainWeights: ckadWeights,
		DifficultyMix: mix,
		ExamLength:    examLength,
	}
	for _, d := range ckadDomainOrder {
		for _, tier := range tierOrder {
			for i := 1; i <= tierPools[d][tier]; i++ {
				e.Questions = append(e.Questions, Question{
					ID:            fmt.Sprintf("%s-%s-%d", d, tier, i),
					Domain:        d,
					Difficulty:    tier,
					TargetSeconds: tierBounds[tier][1],
					Weight:        1,
				})
			}
		}
	}
	return e
}

func tallyBy(e *Exam, ids []string, key func(Question) string) map[string]int {
	byID := map[string]Question{}
	for _, q := range e.Questions {
		byID[q.ID] = q
	}
	out := map[string]int{}
	for _, id := range ids {
		out[key(byID[id])]++
	}
	return out
}

// The mix is a soft constraint, so this asserts the property that matters:
// no tier ever lands more than one question away from its share.
func TestDrawHoldsTheDeclaredLevelMixAcrossSeeds(t *testing.T) {
	e := levelFixture(t, ckadTierPools, ckadMix, 17)
	want := largestRemainder(ckadMix, tierOrder, 17, 100)

	for i := 0; i < 256; i++ {
		seed := fmt.Sprintf("%06x", i*7919)
		res, err := Draw(e, DrawOptions{Seed: seed})
		if err != nil {
			t.Fatalf("Draw(seed %s): %v", seed, err)
		}
		if len(res.IDs) != 17 {
			t.Fatalf("seed %s drew %d questions, want 17", seed, len(res.IDs))
		}
		got := tallyBy(e, res.IDs, func(q Question) string { return q.Difficulty })
		for _, tier := range tierOrder {
			if drift := got[tier] - want[tier]; drift < -1 || drift > 1 {
				t.Fatalf("seed %s drew %d %s questions, want %d (drift %+d, tolerance 1)",
					seed, got[tier], tier, want[tier], drift)
			}
		}
	}
}

func TestDrawMixedIsExactOnDomainsAndReplaysBySeed(t *testing.T) {
	e := levelFixture(t, ckadTierPools, ckadMix, 17)
	want, err := domainTargets(ckadWeights, ckadDomainOrder, 17)
	if err != nil {
		t.Fatalf("domainTargets: %v", err)
	}

	first, err := Draw(e, DrawOptions{Seed: "a1b2c3"})
	if err != nil {
		t.Fatalf("Draw (first): %v", err)
	}
	second, err := Draw(e, DrawOptions{Seed: "a1b2c3"})
	if err != nil {
		t.Fatalf("Draw (second): %v", err)
	}
	if !equalIDs(first.IDs, second.IDs) {
		t.Errorf("same seed drew different sets:\n first  = %v\n second = %v", first.IDs, second.IDs)
	}

	got := tallyBy(e, first.IDs, func(q Question) string { return q.Domain })
	for _, d := range ckadDomainOrder {
		if got[d] != want[d] {
			t.Errorf("domain %q drew %d, want exactly %d — the domain split is the hard constraint", d, got[d], want[d])
		}
	}
}

// A domain that holds only one tier cannot help the mix. The split it
// owes is still exact, and the shortfall carries rather than compounding.
func TestDrawMixedKeepsDomainsExactWhenATierIsUnavailable(t *testing.T) {
	pools := map[string]map[string]int{}
	for d, tiers := range ckadTierPools {
		pools[d] = map[string]int{TierQuick: tiers[TierQuick], TierCore: tiers[TierCore], TierDeep: tiers[TierDeep]}
	}
	lopsided := "Application Observability and Maintenance"
	pools[lopsided] = map[string]int{TierDeep: 8}

	e := levelFixture(t, pools, ckadMix, 17)
	want, err := domainTargets(ckadWeights, ckadDomainOrder, 17)
	if err != nil {
		t.Fatalf("domainTargets: %v", err)
	}

	res, err := Draw(e, DrawOptions{Seed: "beef01"})
	if err != nil {
		t.Fatalf("Draw: %v", err)
	}
	got := tallyBy(e, res.IDs, func(q Question) string { return q.Domain })
	for _, d := range ckadDomainOrder {
		if got[d] != want[d] {
			t.Errorf("domain %q drew %d, want exactly %d", d, got[d], want[d])
		}
	}
	byTier := tallyBy(e, res.IDs, func(q Question) string { return q.Difficulty })
	if byTier[TierDeep] < want[lopsided] {
		t.Errorf("drew %d deep questions, want at least the %d that only-deep domain owes", byTier[TierDeep], want[lopsided])
	}
}

// Guards kcna-mock and the smoke banks: with no mix declared the draw must
// still be the plain per-domain shuffle it has always been.
func TestDrawWithoutAMixIsTheDomainOnlyShuffle(t *testing.T) {
	e := levelFixture(t, ckadTierPools, nil, 17)
	targets, err := domainTargets(ckadWeights, ckadDomainOrder, 17)
	if err != nil {
		t.Fatalf("domainTargets: %v", err)
	}

	res, err := Draw(e, DrawOptions{Seed: "a1b2c3"})
	if err != nil {
		t.Fatalf("Draw: %v", err)
	}

	var want []string
	for _, d := range ckadDomainOrder {
		var pool []string
		for _, q := range e.Questions {
			if q.Domain == d {
				pool = append(pool, q.ID)
			}
		}
		want = append(want, shuffle(pool, "a1b2c3", d)[:targets[d]]...)
	}
	if !equalIDs(res.IDs, want) {
		t.Errorf("a mixless bank no longer draws the legacy per-domain shuffle:\n got  = %v\n want = %v", res.IDs, want)
	}
}

func levelQuestion(id, tier string, targetSeconds int) string {
	return fmt.Sprintf(
		`{"id": %q, "domain": "d", "multi": false, "options": ["A", "B", "C"], "correct": [0], "targetSeconds": %d, "difficulty": %q}`,
		id, targetSeconds, tier)
}

func TestLoadDifficultyValidation(t *testing.T) {
	mix := func(body string) string { return fmt.Sprintf(`"examType": "mcq", "difficultyMix": {%s},`, body) }
	good := `"quick": 30, "core": 45, "deep": 25`

	cases := []struct {
		name     string
		spec     string
		question string
		wantErr  string
	}{
		{"mix does not sum to 100", mix(`"quick": 30, "core": 45, "deep": 20`),
			levelQuestion("q01", TierQuick, 200), "sums to 95"},
		{"unknown tier", mix(`"quick": 30, "core": 45, "brutal": 25`),
			levelQuestion("q01", TierQuick, 200), "unknown tier"},
		{"negative share", mix(`"quick": 130, "core": 0, "deep": -30`),
			levelQuestion("q01", TierQuick, 200), "negative share"},
		{"question has no tier", mix(good),
			`{"id": "q01", "domain": "d", "multi": false, "options": ["A", "B", "C"], "correct": [0], "targetSeconds": 200}`,
			"declares a tier on every question"},
		{"question has an unknown tier", mix(good),
			levelQuestion("q01", "brutal", 200), "declares a tier on every question"},
		{"tier contradicts targetSeconds", mix(good),
			levelQuestion("q01", TierQuick, 600), "outside that tier's 1-240 band"},
		{"targetSeconds beyond the deepest band", mix(good),
			levelQuestion("q01", TierDeep, 1200), "outside that tier's 541-840 band"},
		{"no targetSeconds to place the tier", mix(good),
			`{"id": "q01", "domain": "d", "multi": false, "options": ["A", "B", "C"], "correct": [0], "difficulty": "quick"}`,
			"sets no targetSeconds"},
		{"a tier the bank cannot supply", mix(good),
			levelQuestion("q01", TierQuick, 200), "asks for 45% core questions and the bank holds none"},
		{"a tier without a mix to draw against", `"examType": "mcq",`,
			levelQuestion("q01", TierQuick, 200), "declares no spec.difficultyMix"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := loadMCQDoc(t, c.spec, c.question)
			if err == nil {
				t.Fatalf("Load: got nil error, want one containing %q", c.wantErr)
			}
			if !strings.Contains(err.Error(), c.wantErr) {
				t.Errorf("error = %v, want it to contain %q", err, c.wantErr)
			}
		})
	}
}

func TestLoadAcceptsAWellFormedMix(t *testing.T) {
	e, err := loadMCQDoc(t,
		`"examType": "mcq", "difficultyMix": {"quick": 30, "core": 45, "deep": 25},`,
		levelQuestion("q01", TierQuick, 240),
		levelQuestion("q02", TierCore, 241),
		levelQuestion("q03", TierDeep, 541),
	)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got := e.DifficultyMix[TierCore]; got != 45 {
		t.Errorf("DifficultyMix[core] = %d, want 45", got)
	}
	for i, want := range []string{TierQuick, TierCore, TierDeep} {
		if got := e.Questions[i].Difficulty; got != want {
			t.Errorf("Questions[%d].Difficulty = %q, want %q", i, got, want)
		}
	}
}
