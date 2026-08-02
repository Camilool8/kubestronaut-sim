package exam

import (
	"errors"
	"strings"
	"testing"
	"time"
)

// drawFixture is poolFixture's kcna-shaped default: four domains with
// pools deep enough for a 65-question draw to have real choices to make.
func drawFixture(t *testing.T, examLength int) *Exam {
	t.Helper()
	return poolFixture(t, kcnaDomainOrder, kcnaWeights, map[string]int{
		"Kubernetes Fundamentals": 40, "Container Orchestration": 30,
		"Cloud Native Application Delivery": 16, "Cloud Native Architecture": 15,
	}, examLength)
}

func equalIDs(a, b []string) bool {
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

// The whole promise of a seed: the same seed against the same pool draws
// the same questions, in the same order, every time. Without this a
// candidate cannot re-sit the exam they just failed, and two people
// cannot sit the same one.
func TestDrawSameSeedSamePoolIsIdentical(t *testing.T) {
	e := drawFixture(t, 65)

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
	if first.Seed != "a1b2c3" || second.Seed != "a1b2c3" {
		t.Errorf("seeds = %q / %q, want the supplied a1b2c3 echoed back", first.Seed, second.Seed)
	}
	if first.PoolDigest != second.PoolDigest {
		t.Errorf("pool digests = %q / %q, want equal for one unchanged pool", first.PoolDigest, second.PoolDigest)
	}
}

// A seed only reproduces a draw WITHIN one pool. Edit the bank and the
// same seed is a different exam — which is exactly why the digest
// travels beside the seed rather than the seed being trusted alone.
func TestDrawSameSeedChangedPoolDiffers(t *testing.T) {
	e := drawFixture(t, 65)
	before, err := Draw(e, DrawOptions{Seed: "a1b2c3"})
	if err != nil {
		t.Fatalf("Draw (before): %v", err)
	}

	// One question retired out of the Fundamentals pool.
	trimmed := *e
	trimmed.Questions = nil
	for _, q := range e.Questions {
		if q.ID != "Kubernetes Fundamentals-7" {
			trimmed.Questions = append(trimmed.Questions, q)
		}
	}
	if len(trimmed.Questions) != len(e.Questions)-1 {
		t.Fatalf("fixture: removed %d questions, want 1", len(e.Questions)-len(trimmed.Questions))
	}

	after, err := Draw(&trimmed, DrawOptions{Seed: "a1b2c3"})
	if err != nil {
		t.Fatalf("Draw (after): %v", err)
	}

	if before.PoolDigest == after.PoolDigest {
		t.Error("pool digest survived a question being removed — it does not detect what it exists to detect")
	}
	if equalIDs(before.IDs, after.IDs) {
		t.Error("the same seed drew the identical set out of a changed pool — the draw is not actually a function of the pool")
	}
}

// The digest must be blind to everything a draw does not depend on. A
// reworded stem, a fixed typo in an option, a new hint tier: none of
// them changes which questions exist, so none may invalidate a seed
// somebody wrote down.
func TestPoolDigestIgnoresUnrelatedEdits(t *testing.T) {
	e := drawFixture(t, 65)
	before := PoolDigest(e)

	edited := *e
	edited.Questions = append([]Question(nil), e.Questions...)
	edited.Questions[3].Options = []string{"a rewritten option", "b", "c"}
	edited.Questions[3].Title = "A better title"
	edited.Questions[3].HintCount = 2
	edited.Questions[3].Weight = 4

	if got := PoolDigest(&edited); got != before {
		t.Errorf("digest changed on an edit that changes no question's identity: %q -> %q", before, got)
	}

	// Re-domaining one, by contrast, changes what every draw produces.
	moved := *e
	moved.Questions = append([]Question(nil), e.Questions...)
	moved.Questions[3].Domain = "Cloud Native Architecture"
	if got := PoolDigest(&moved); got == before {
		t.Error("digest survived a question changing domain, which changes every stratified draw")
	}
}

// CheckPool is the guard on Subset's deliberate id-skipping: grading a
// session whose pool has moved on must fail loudly rather than score the
// intersection and report a confident, wrong total.
func TestCheckPool(t *testing.T) {
	e := drawFixture(t, 65)

	if err := CheckPool(e, PoolDigest(e)); err != nil {
		t.Errorf("CheckPool with the matching digest: %v, want nil", err)
	}
	// An attempt from before digests existed carries none, and is not
	// second-guessed.
	if err := CheckPool(e, ""); err != nil {
		t.Errorf("CheckPool with no digest: %v, want nil", err)
	}

	err := CheckPool(e, "000000000000")
	if err == nil {
		t.Fatal("CheckPool with a stale digest: got nil, want a refusal")
	}
	if !errors.Is(err, ErrPoolChanged) {
		t.Errorf("err = %v, want it to wrap ErrPoolChanged", err)
	}
	if !strings.Contains(err.Error(), "000000000000") {
		t.Errorf("err = %v, want it to name the digest the attempt was drawn from", err)
	}
}

// A malformed seed is refused, not silently replaced: a candidate who
// mistypes the seed they wanted to replay must be told, not handed a
// different exam that looks like the one they asked for.
func TestDrawRejectsMalformedSeed(t *testing.T) {
	e := drawFixture(t, 65)
	for _, seed := range []string{"A1B2C3", "abc", "a1b2c3d", "zzzzzz", "a1b2c 3", "0x1234"} {
		_, err := Draw(e, DrawOptions{Seed: seed})
		if err == nil {
			t.Errorf("Draw with seed %q: got nil error, want a refusal", seed)
			continue
		}
		if !errors.Is(err, ErrDrawRequest) {
			t.Errorf("Draw with seed %q: err = %v, want it wrapped in ErrDrawRequest", seed, err)
		}
	}
}

// Every attempt has a seed whether or not anyone asked for one, so every
// attempt is replayable after the fact rather than only if the candidate
// thought to plan for it.
func TestDrawMintsASeedWhenNoneGiven(t *testing.T) {
	e := drawFixture(t, 65)
	res, err := Draw(e, DrawOptions{})
	if err != nil {
		t.Fatalf("Draw: %v", err)
	}
	if !seedPattern.MatchString(res.Seed) {
		t.Errorf("minted seed = %q, want six lowercase hex digits", res.Seed)
	}
	// And it is the seed that was actually used.
	replay, err := Draw(e, DrawOptions{Seed: res.Seed})
	if err != nil {
		t.Fatalf("Draw (replay): %v", err)
	}
	if !equalIDs(res.IDs, replay.IDs) {
		t.Error("replaying the minted seed drew a different set — the reported seed is not the one that ran")
	}
}

// A domain filter narrows an MCQ draw to those domains and nothing else,
// and the questions inside them still divide by the curriculum's
// published ratios — renormalized over the domains that remain, since
// two of four weights do not sum to 100.
func TestDrawDomainFilterNarrowsMCQ(t *testing.T) {
	e := drawFixture(t, 10)
	res, err := Draw(e, DrawOptions{
		Seed:    "abc123",
		Domains: []string{"Container Orchestration", "Kubernetes Fundamentals"},
	})
	if err != nil {
		t.Fatalf("Draw: %v", err)
	}
	if len(res.IDs) != 10 {
		t.Fatalf("len(IDs) = %d, want 10", len(res.IDs))
	}

	byID := map[string]Question{}
	for _, q := range e.Questions {
		byID[q.ID] = q
	}
	counts := map[string]int{}
	for _, id := range res.IDs {
		q, ok := byID[id]
		if !ok {
			t.Fatalf("drawn id %q is not in the pool", id)
		}
		counts[q.Domain]++
	}
	// 44 and 28 renormalized over 72: 6.11 and 3.89 of 10, so 6 and 4
	// after the leftover slot goes to the larger remainder.
	if counts["Kubernetes Fundamentals"] != 6 || counts["Container Orchestration"] != 4 {
		t.Errorf("domain counts = %v, want 6 Fundamentals and 4 Orchestration", counts)
	}
	if len(counts) != 2 {
		t.Errorf("drew from %d domains, want exactly the 2 requested", len(counts))
	}

	// Normalized back into bank order, whatever order it was asked for.
	want := []string{"Kubernetes Fundamentals", "Container Orchestration"}
	if !equalIDs(res.Domains, want) {
		t.Errorf("Domains = %v, want %v (bank order)", res.Domains, want)
	}
}

// The filter applies to the hands-on engine too. There is no draw to
// speak of there — every in-scope question is included, in bank order —
// but which questions are in scope is exactly what the filter decides,
// and bootstrap.sh has seeded all of them into the cluster regardless.
func TestDrawDomainFilterNarrowsHandsOn(t *testing.T) {
	e := &Exam{
		Type:          TypeHandsOn,
		Duration:      2 * time.Hour,
		DomainWeights: map[string]int{"Workloads": 60, "Services": 40},
		Questions: []Question{
			{ID: "q01", Domain: "Workloads", Weight: 5},
			{ID: "q02", Domain: "Services", Weight: 5},
			{ID: "q03", Domain: "Workloads", Weight: 5},
			{ID: "q04", Domain: "Services", Weight: 5},
		},
	}

	all, err := Draw(e, DrawOptions{Seed: "abc123"})
	if err != nil {
		t.Fatalf("Draw (unfiltered): %v", err)
	}
	if !equalIDs(all.IDs, []string{"q01", "q02", "q03", "q04"}) {
		t.Errorf("unfiltered hands-on IDs = %v, want every question in bank order", all.IDs)
	}
	if all.Domains != nil {
		t.Errorf("unfiltered Domains = %v, want nil (the whole curriculum)", all.Domains)
	}

	filtered, err := Draw(e, DrawOptions{Seed: "abc123", Domains: []string{"Services"}})
	if err != nil {
		t.Fatalf("Draw (filtered): %v", err)
	}
	if !equalIDs(filtered.IDs, []string{"q02", "q04"}) {
		t.Errorf("filtered hands-on IDs = %v, want [q02 q04] in bank order", filtered.IDs)
	}
}

// A domain the bank does not have is a mistake worth naming. Drawing
// zero questions from it and starting the attempt anyway would look like
// a working exam right up until the score.
func TestDrawUnknownDomainIsARequestError(t *testing.T) {
	e := drawFixture(t, 65)
	_, err := Draw(e, DrawOptions{Domains: []string{"Kubernetes Fundamentals", "Networking"}})
	if err == nil {
		t.Fatal("Draw with an unknown domain: got nil error, want a refusal")
	}
	if !errors.Is(err, ErrDrawRequest) {
		t.Errorf("err = %v, want it wrapped in ErrDrawRequest", err)
	}
	if !strings.Contains(err.Error(), "Networking") {
		t.Errorf("err = %v, want it to name the domain that does not exist", err)
	}
}

// Naming every domain is the whole curriculum said the long way.
// Recording it as a filter would make a full-coverage attempt — the only
// kind a "passed" claim rests on — look narrowed for the rest of its
// life.
func TestDrawFilterNamingEveryDomainIsNoFilter(t *testing.T) {
	e := drawFixture(t, 65)
	res, err := Draw(e, DrawOptions{Seed: "abc123", Domains: kcnaDomainOrder})
	if err != nil {
		t.Fatalf("Draw: %v", err)
	}
	if res.Domains != nil {
		t.Errorf("Domains = %v, want nil", res.Domains)
	}
	unfiltered, err := Draw(e, DrawOptions{Seed: "abc123"})
	if err != nil {
		t.Fatalf("Draw (unfiltered): %v", err)
	}
	if !equalIDs(res.IDs, unfiltered.IDs) {
		t.Error("naming every domain drew a different set from naming none")
	}
}

// An authored targetSeconds is the author's judgement and is reported
// as such; a derived one is arithmetic over the question's share of the
// exam clock, and must say so.
func TestTargetSecondsAuthoredAndDerived(t *testing.T) {
	// ckad-mock-01's shape: 22 questions, 180 points, a 120-minute clock.
	handsOn := &Exam{Type: TypeHandsOn, Duration: 2 * time.Hour}
	for i := 0; i < 20; i++ {
		handsOn.Questions = append(handsOn.Questions, Question{ID: "q", Domain: "d", Weight: 9})
	}
	// 20 * 9 = 180 points over 7200s, so a 9-point question is worth 360s.
	got, derived := TargetSeconds(handsOn, handsOn.Questions[0])
	if got != 360 || !derived {
		t.Errorf("derived hands-on target = %ds (derived=%v), want 360s derived", got, derived)
	}

	authored := handsOn.Questions[0]
	authored.TargetSeconds = 600
	got, derived = TargetSeconds(handsOn, authored)
	if got != 600 || derived {
		t.Errorf("authored target = %ds (derived=%v), want 600s not derived", got, derived)
	}
}

// The divisor is the weight ONE ATTEMPT carries, not the pool's. kcna's
// 90 minutes are spread across the 65 questions a candidate gets, not
// across the 97 the bank authored — dividing by the pool would advertise
// 56 seconds a question for an exam that gives 83.
func TestTargetSecondsDividesTheDrawNotThePool(t *testing.T) {
	pooled := &Exam{Type: TypeMCQ, Duration: 90 * time.Minute, ExamLength: 65}
	for i := 0; i < 97; i++ {
		pooled.Questions = append(pooled.Questions, Question{ID: "q", Domain: "d", Weight: 1})
	}
	got, derived := TargetSeconds(pooled, pooled.Questions[0])
	if !derived {
		t.Error("derived = false, want true")
	}
	if got != 83 {
		t.Errorf("derived pooled target = %ds, want 83s (5400s / 65 questions)", got)
	}
}

// An untimed attempt has no clock to divide, so the budget comes from
// the bank's declared duration — the exam this practice is practice for
// — rather than collapsing to zero.
func TestTargetSecondsUsesTheBankClockNotTheAttempts(t *testing.T) {
	e := &Exam{Type: TypeMCQ, Duration: 90 * time.Minute, ExamLength: 65}
	for i := 0; i < 97; i++ {
		e.Questions = append(e.Questions, Question{ID: "q", Domain: "d", Weight: 1})
	}
	// TargetSeconds never sees an attempt at all, which is the point:
	// there is no parameter through which a training attempt's zero
	// clock could reach it.
	got, _ := TargetSeconds(e, e.Questions[0])
	if got != 83 {
		t.Errorf("target = %ds, want 83s from the bank's own duration", got)
	}
}

// The keyed stream must produce a uniform shuffle, not a plausible-
// looking one. A biased intn is invisible in any single draw and shows
// up only as certain questions appearing more often than others across a
// candidate's whole practice history.
func TestDrawStreamIntnCoversItsRange(t *testing.T) {
	counts := make([]int, 7)
	s := newDrawStream("abc123", "label")
	const rounds = 70000
	for i := 0; i < rounds; i++ {
		v := s.intn(len(counts))
		if v < 0 || v >= len(counts) {
			t.Fatalf("intn(7) returned %d, out of range", v)
		}
		counts[v]++
	}
	want := rounds / len(counts)
	for v, n := range counts {
		// Deterministic input, so this threshold cannot flake: it either
		// holds for this stream or the test fails on every run.
		if n < want*9/10 || n > want*11/10 {
			t.Errorf("value %d came up %d times, want within 10%% of %d", v, n, want)
		}
	}
}

// Two different labels under one seed must not be the same stream —
// otherwise every domain would shuffle identically, and a pool laid out
// the same way in two domains would draw the same positions from both.
func TestDrawStreamLabelsAreIndependent(t *testing.T) {
	ids := []string{"1", "2", "3", "4", "5", "6", "7", "8"}
	a := shuffle(ids, "abc123", "Domain A")
	b := shuffle(ids, "abc123", "Domain B")
	if equalIDs(a, b) {
		t.Errorf("two labels shuffled identically: %v", a)
	}
	if !equalIDs(a, shuffle(ids, "abc123", "Domain A")) {
		t.Error("the same (seed, label) pair shuffled differently twice")
	}
}
