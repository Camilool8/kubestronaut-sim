package exam

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"
)

const (
	examJSON = "testdata/exam.json"
	bankDir  = "testdata/bank"
)

func TestLoad(t *testing.T) {
	e, err := Load(examJSON, bankDir)
	if err != nil {
		t.Fatalf("Load(%q, %q): %v", examJSON, bankDir, err)
	}

	if e.Name != "ckad-mock-01" {
		t.Errorf("Name = %q, want %q", e.Name, "ckad-mock-01")
	}
	if e.Title != "CKAD Mock Exam 01" {
		t.Errorf("Title = %q, want %q", e.Title, "CKAD Mock Exam 01")
	}
	if e.Duration != 2*time.Hour {
		t.Errorf("Duration = %v, want %v (spec.duration %q)", e.Duration, 2*time.Hour, "120m")
	}
	if e.PassingScore != 66 {
		t.Errorf("PassingScore = %d, want 66", e.PassingScore)
	}
	if e.KubernetesVersion != "1.35" {
		t.Errorf("KubernetesVersion = %q, want %q", e.KubernetesVersion, "1.35")
	}

	if len(e.Questions) != 2 {
		t.Fatalf("len(Questions) = %d, want 2", len(e.Questions))
	}

	// exam.json lists q02 before q01 — Questions must preserve that file
	// order, not sort by ID.
	q02, q01 := e.Questions[0], e.Questions[1]
	if q02.ID != "q02" {
		t.Errorf("Questions[0].ID = %q, want %q (file order not preserved)", q02.ID, "q02")
	}
	if q01.ID != "q01" {
		t.Errorf("Questions[1].ID = %q, want %q (file order not preserved)", q01.ID, "q01")
	}

	if q02.Title != "Fix a failing Deployment" {
		t.Errorf("q02.Title = %q, want %q", q02.Title, "Fix a failing Deployment")
	}
	if q01.Title != "" {
		t.Errorf("q01.Title = %q, want empty (title is optional)", q01.Title)
	}
	if q02.Instance != "instance-1" {
		t.Errorf("q02.Instance = %q, want %q", q02.Instance, "instance-1")
	}
	if q02.Domain != "Application Deployment" {
		t.Errorf("q02.Domain = %q, want %q", q02.Domain, "Application Deployment")
	}
	if q02.Weight != 7 {
		t.Errorf("q02.Weight = %d, want 7", q02.Weight)
	}
	if q01.Domain != "Application Environment, Configuration and Security" {
		t.Errorf("q01.Domain = %q, want comma preserved verbatim, got %q", q01.Domain, q01.Domain)
	}

	// q01/validate.d has two scripts; checks must be in lexical filename
	// order: 10_ok.sh before 20_bad-points.sh.
	if len(q01.Checks) != 2 {
		t.Fatalf("len(q01.Checks) = %d, want 2", len(q01.Checks))
	}
	ok, bad := q01.Checks[0], q01.Checks[1]

	if ok.Name != "10_ok.sh" {
		t.Errorf("q01.Checks[0].Name = %q, want %q", ok.Name, "10_ok.sh")
	}
	if ok.Points != 3 {
		t.Errorf("10_ok.sh Points = %d, want 3", ok.Points)
	}
	if ok.Desc != "x" {
		t.Errorf("10_ok.sh Desc = %q, want %q", ok.Desc, "x")
	}
	if ok.Skip {
		t.Errorf("10_ok.sh Skip = true, want false")
	}

	if bad.Name != "20_bad-points.sh" {
		t.Errorf("q01.Checks[1].Name = %q, want %q", bad.Name, "20_bad-points.sh")
	}
	if !bad.Skip {
		t.Errorf("20_bad-points.sh (# points: 08) Skip = false, want true (leading zero)")
	}
	if bad.Points != 0 {
		t.Errorf("20_bad-points.sh Points = %d, want 0 (skipped)", bad.Points)
	}
	wantDesc := "ratio 3:1 must hold, e.g. 3:1 not 1:3"
	if bad.Desc != wantDesc {
		t.Errorf("20_bad-points.sh Desc = %q, want %q (colons preserved verbatim)", bad.Desc, wantDesc)
	}

	// q02/validate.d has one script with no header at all.
	if len(q02.Checks) != 1 {
		t.Fatalf("len(q02.Checks) = %d, want 1", len(q02.Checks))
	}
	missing := q02.Checks[0]
	if missing.Name != "10_two.sh" {
		t.Errorf("q02.Checks[0].Name = %q, want %q", missing.Name, "10_two.sh")
	}
	if !missing.Skip {
		t.Errorf("10_two.sh (no header) Skip = false, want true")
	}
	if missing.Points != 0 {
		t.Errorf("10_two.sh Points = %d, want 0 (skipped)", missing.Points)
	}
}

func TestLoadUnknownExamPath(t *testing.T) {
	if _, err := Load("testdata/does-not-exist.json", bankDir); err == nil {
		t.Error("Load with unknown exam JSON path: got nil error, want non-nil")
	}
}

func TestLoadNoValidateScripts(t *testing.T) {
	_, err := Load("testdata/exam-no-validate.json", bankDir)
	if err == nil {
		t.Error("Load with question having no validate.d scripts: got nil error, want non-nil")
	}
	if err != nil && !strings.Contains(err.Error(), "has no validate.d scripts") {
		t.Errorf("Load error = %v, want error mentioning 'has no validate.d scripts'", err)
	}
}

func TestParsePoints(t *testing.T) {
	cases := []struct {
		name       string
		raw        string
		present    bool
		wantPoints int
		wantSkip   bool
	}{
		{"valid", "3", true, 3, false},
		{"zero", "0", true, 0, false},
		{"leading zero", "08", true, 0, true},
		{"negative", "-1", true, 0, true},
		{"non-numeric", "abc", true, 0, true},
		{"empty value", "", true, 0, true},
		{"missing header", "", false, 0, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			points, skip := parsePoints(c.raw, c.present)
			if points != c.wantPoints || skip != c.wantSkip {
				t.Errorf("parsePoints(%q, %v) = (%d, %v), want (%d, %v)",
					c.raw, c.present, points, skip, c.wantPoints, c.wantSkip)
			}
		})
	}
}

func TestCountAndSplitHints(t *testing.T) {
	dir := t.TempDir()
	qdir := filepath.Join(dir, "q01")
	if err := os.MkdirAll(qdir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Text before the first heading is deliberately ignored, so an
	// author can leave a note at the top of the file.
	body := "some authoring note\n\n## Hint 1\n\nlook at the selector\n\n## Hint 2\n\ntry `kubectl get svc`\n"
	if err := os.WriteFile(filepath.Join(qdir, "hints.md"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}

	if got := countHints(dir, "q01"); got != 2 {
		t.Errorf("countHints = %d, want 2", got)
	}

	raw, _ := os.ReadFile(HintsPath(dir, "q01"))
	tiers := SplitHints(raw)
	if len(tiers) != 2 {
		t.Fatalf("len(SplitHints) = %d, want 2", len(tiers))
	}
	if tiers[0] != "look at the selector" {
		t.Errorf("tier 1 = %q", tiers[0])
	}
	if tiers[1] != "try `kubectl get svc`" {
		t.Errorf("tier 2 = %q", tiers[1])
	}
}

// A bank with no hints must load, not error: hints are optional, and
// smoke-01 has none.
func TestCountHintsIsZeroWhenAbsent(t *testing.T) {
	if got := countHints(t.TempDir(), "q01"); got != 0 {
		t.Errorf("countHints on a bank with no hints.md = %d, want 0", got)
	}
}

func TestLoadMCQ(t *testing.T) {
	e, err := Load("testdata/exam-mcq.json", "testdata/bank-mcq")
	if err != nil {
		t.Fatalf("Load mcq fixture: %v", err)
	}

	if e.Type != TypeMCQ {
		t.Errorf("Type = %q, want %q", e.Type, TypeMCQ)
	}
	if len(e.Questions) != 2 {
		t.Fatalf("len(Questions) = %d, want 2", len(e.Questions))
	}

	q01, q02 := e.Questions[0], e.Questions[1]

	if q01.Multi {
		t.Errorf("q01.Multi = true, want false")
	}
	if len(q01.Options) != 4 {
		t.Errorf("len(q01.Options) = %d, want 4", len(q01.Options))
	}
	if len(q01.Correct) != 1 || q01.Correct[0] != 2 {
		t.Errorf("q01.Correct = %v, want [2]", q01.Correct)
	}
	// weight is optional for mcq and defaults to 1, matching the real
	// exam's uniform scoring.
	if q01.Weight != 1 {
		t.Errorf("q01.Weight = %d, want 1 (default)", q01.Weight)
	}
	// A declared weight is preserved verbatim.
	if q02.Weight != 2 {
		t.Errorf("q02.Weight = %d, want 2 (explicit)", q02.Weight)
	}
	if !q02.Multi {
		t.Errorf("q02.Multi = false, want true")
	}
	if len(q02.Correct) != 2 || q02.Correct[0] != 0 || q02.Correct[1] != 3 {
		t.Errorf("q02.Correct = %v, want [0 3]", q02.Correct)
	}
	// An mcq question has no checks, and never an instance.
	if len(q01.Checks) != 0 {
		t.Errorf("len(q01.Checks) = %d, want 0", len(q01.Checks))
	}
	if q01.Instance != "" {
		t.Errorf("q01.Instance = %q, want empty", q01.Instance)
	}
	// Hints machinery is examType-agnostic: q01 has a hints.md fixture.
	if q01.HintCount != 2 {
		t.Errorf("q01.HintCount = %d, want 2", q01.HintCount)
	}
	if q02.HintCount != 0 {
		t.Errorf("q02.HintCount = %d, want 0", q02.HintCount)
	}
}

// TestLoadDefaultsToHandsOn pins the v1alpha1 compatibility rule: a bank
// with no spec.examType is a hands-on bank.
func TestLoadDefaultsToHandsOn(t *testing.T) {
	e, err := Load(examJSON, bankDir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if e.Type != TypeHandsOn {
		t.Errorf("Type = %q, want %q (empty examType must normalize)", e.Type, TypeHandsOn)
	}
}

func TestLoadUnknownExamType(t *testing.T) {
	_, err := loadMCQDoc(t, `"examType": "essay",`, mcqQuestion("q01", false, 4, []int{0}))
	if err == nil {
		t.Fatal("Load with examType essay: got nil error, want non-nil")
	}
	if !strings.Contains(err.Error(), "essay") {
		t.Errorf("error = %v, want mention of the unknown type", err)
	}
}

func TestLoadMCQValidation(t *testing.T) {
	cases := []struct {
		name     string
		question string
		wantErr  string
	}{
		{"too few options", mcqQuestion("q01", false, 2, []int{0}), "options"},
		{"too many options", mcqQuestion("q01", false, 7, []int{0}), "options"},
		{"no correct", mcqQuestion("q01", false, 4, nil), "correct"},
		{"out of range", mcqQuestion("q01", false, 4, []int{4}), "correct"},
		{"negative index", mcqQuestion("q01", false, 4, []int{-1}), "correct"},
		{"duplicate", mcqQuestion("q01", true, 4, []int{1, 1}), "correct"},
		{"unsorted", mcqQuestion("q01", true, 4, []int{2, 0}), "correct"},
		{"single with two", mcqQuestion("q01", false, 4, []int{0, 1}), "exactly one"},
		{"multi with one", mcqQuestion("q01", true, 4, []int{0}), "at least two"},
		{"multi all correct", mcqQuestion("q01", true, 4, []int{0, 1, 2, 3}), "fewer than all"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := loadMCQDoc(t, `"examType": "mcq",`, c.question)
			if err == nil {
				t.Fatalf("Load: got nil error, want error containing %q", c.wantErr)
			}
			if !strings.Contains(err.Error(), c.wantErr) {
				t.Errorf("error = %v, want it to contain %q", err, c.wantErr)
			}
		})
	}
}

// mcqQuestion renders one spec.questions entry with n options and the
// given correct indices.
func mcqQuestion(id string, multi bool, n int, correct []int) string {
	opts := make([]string, n)
	for i := range opts {
		opts[i] = fmt.Sprintf("%q", string(rune('A'+i)))
	}
	sel := make([]string, len(correct))
	for i, c := range correct {
		sel[i] = strconv.Itoa(c)
	}
	return fmt.Sprintf(`{"id": %q, "domain": "d", "multi": %v, "options": [%s], "correct": [%s]}`,
		id, multi, strings.Join(opts, ", "), strings.Join(sel, ", "))
}

// loadMCQDoc writes a minimal exam.json with the given spec fragment and
// question entries into a temp dir and loads it.
func loadMCQDoc(t *testing.T, specExtra string, questions ...string) (*Exam, error) {
	t.Helper()
	doc := fmt.Sprintf(`{
  "metadata": {"name": "t", "title": "t"},
  "spec": {
    %s
    "duration": "90m",
    "passingScore": 75,
    "questions": [%s]
  }
}`, specExtra, strings.Join(questions, ", "))
	dir := t.TempDir()
	path := filepath.Join(dir, "exam.json")
	if err := os.WriteFile(path, []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}
	return Load(path, dir)
}

// poolFixture builds an Exam with the given domain weights and, for each
// domain, a pool of poolSizes[domain] questions in "<domain-initial><n>"
// ids (e.g. "F1".."F6" for "Fundamentals") — plenty for DrawMCQ to
// sample from without colliding with real bank ids in any test failure
// message.
func poolFixture(t *testing.T, order []string, weights map[string]int, poolSizes map[string]int, examLength int) *Exam {
	t.Helper()
	e := &Exam{Type: TypeMCQ, DomainWeights: weights, ExamLength: examLength}
	for _, d := range order {
		n := poolSizes[d]
		for i := 1; i <= n; i++ {
			e.Questions = append(e.Questions, Question{
				ID:      fmt.Sprintf("%s-%d", d, i),
				Domain:  d,
				Weight:  1,
				Options: []string{"a", "b", "c"},
				Correct: []int{0},
			})
		}
	}
	return e
}

var kcnaDomainOrder = []string{
	"Kubernetes Fundamentals", "Container Orchestration",
	"Cloud Native Application Delivery", "Cloud Native Architecture",
}

var kcnaWeights = map[string]int{
	"Kubernetes Fundamentals":           44,
	"Container Orchestration":           28,
	"Cloud Native Application Delivery": 16,
	"Cloud Native Architecture":         12,
}

func TestDomainTargetsLargestRemainder(t *testing.T) {
	cases := []struct {
		n    int
		want map[string]int
	}{
		// The shipped kcna-mock bank's own 65-question draw.
		{65, map[string]int{
			"Kubernetes Fundamentals": 29, "Container Orchestration": 18,
			"Cloud Native Application Delivery": 10, "Cloud Native Architecture": 8,
		}},
		// A small n that exercises the tie-break: floors sum to 8,
		// leftover 2 goes to the two largest fractional remainders
		// (Orchestration .8, then Delivery .6).
		{10, map[string]int{
			"Kubernetes Fundamentals": 4, "Container Orchestration": 3,
			"Cloud Native Application Delivery": 2, "Cloud Native Architecture": 1,
		}},
	}
	for _, c := range cases {
		got, err := domainTargets(kcnaWeights, kcnaDomainOrder, c.n)
		if err != nil {
			t.Fatalf("domainTargets(n=%d): %v", c.n, err)
		}
		for d, want := range c.want {
			if got[d] != want {
				t.Errorf("n=%d: targets[%q] = %d, want %d", c.n, d, got[d], want)
			}
		}
		sum := 0
		for _, v := range got {
			sum += v
		}
		if sum != c.n {
			t.Errorf("n=%d: targets sum to %d, want %d", c.n, sum, c.n)
		}
	}
}

func TestDomainTargetsMissingDomainErrors(t *testing.T) {
	_, err := domainTargets(map[string]int{"A": 100}, []string{"A", "B"}, 10)
	if err == nil || !strings.Contains(err.Error(), `"B"`) {
		t.Errorf("domainTargets with an undeclared domain: err = %v, want it to name %q", err, "B")
	}
}

// DrawMCQ with no pooling configured (the default every bank has until
// it opts in) must return every question, unchanged, in bank order —
// this is the backward-compatibility path every existing mcq bank and
// the hidden smoke-mcq fixture rely on.
func TestDrawMCQNoPoolingReturnsFullBankInOrder(t *testing.T) {
	e := poolFixture(t, kcnaDomainOrder, kcnaWeights,
		map[string]int{
			"Kubernetes Fundamentals": 3, "Container Orchestration": 2,
			"Cloud Native Application Delivery": 2, "Cloud Native Architecture": 2,
		}, 0)
	ids, err := DrawMCQ(e)
	if err != nil {
		t.Fatalf("DrawMCQ: %v", err)
	}
	if len(ids) != len(e.Questions) {
		t.Fatalf("len(ids) = %d, want %d (the full pool)", len(ids), len(e.Questions))
	}
	for i, q := range e.Questions {
		if ids[i] != q.ID {
			t.Errorf("ids[%d] = %q, want %q (bank order preserved)", i, ids[i], q.ID)
		}
	}
}

// A pooled draw must land exactly on domainTargets' per-domain counts —
// not just approximately, every single time — and never repeat or
// invent an id.
func TestDrawMCQStratifiesExactlyByDomain(t *testing.T) {
	poolSizes := map[string]int{
		"Kubernetes Fundamentals": 40, "Container Orchestration": 30,
		"Cloud Native Application Delivery": 16, "Cloud Native Architecture": 15,
	}
	e := poolFixture(t, kcnaDomainOrder, kcnaWeights, poolSizes, 65)

	byID := map[string]Question{}
	for _, q := range e.Questions {
		byID[q.ID] = q
	}

	ids, err := DrawMCQ(e)
	if err != nil {
		t.Fatalf("DrawMCQ: %v", err)
	}
	if len(ids) != 65 {
		t.Fatalf("len(ids) = %d, want 65", len(ids))
	}

	seen := map[string]bool{}
	counts := map[string]int{}
	for _, id := range ids {
		if seen[id] {
			t.Errorf("id %q drawn twice", id)
		}
		seen[id] = true
		q, ok := byID[id]
		if !ok {
			t.Fatalf("drawn id %q is not in the pool", id)
		}
		counts[q.Domain]++
	}
	want := map[string]int{
		"Kubernetes Fundamentals": 29, "Container Orchestration": 18,
		"Cloud Native Application Delivery": 10, "Cloud Native Architecture": 8,
	}
	for d, w := range want {
		if counts[d] != w {
			t.Errorf("domain %q contributed %d questions, want %d", d, counts[d], w)
		}
	}
}

// Two draws from the same pool must (almost always) differ — otherwise
// this "random" draw is a fixed sample wearing a randomizer's clothes.
// The pool here is large enough that a coincidental match is
// astronomically unlikely, so a match is treated as a real failure.
func TestDrawMCQVariesBetweenAttempts(t *testing.T) {
	poolSizes := map[string]int{
		"Kubernetes Fundamentals": 40, "Container Orchestration": 30,
		"Cloud Native Application Delivery": 16, "Cloud Native Architecture": 15,
	}
	e := poolFixture(t, kcnaDomainOrder, kcnaWeights, poolSizes, 65)

	first, err := DrawMCQ(e)
	if err != nil {
		t.Fatalf("DrawMCQ (first): %v", err)
	}
	second, err := DrawMCQ(e)
	if err != nil {
		t.Fatalf("DrawMCQ (second): %v", err)
	}
	same := true
	for i := range first {
		if first[i] != second[i] {
			same = false
			break
		}
	}
	if same {
		t.Error("two draws from a pool this large produced the identical sequence — draw is not actually randomizing")
	}
}

// A domain whose authored pool is smaller than the draw needs is a bank
// bug DrawMCQ must refuse rather than silently under-fill.
func TestDrawMCQErrorsWhenADomainPoolIsTooShallow(t *testing.T) {
	// Every other domain's pool is generously oversized (so the total
	// pool safely exceeds the 65-question draw and this actually
	// exercises the per-domain check, not the "pool <= examLength, skip
	// pooling entirely" backward-compat path) while Architecture alone
	// falls one short of its target of 8.
	poolSizes := map[string]int{
		"Kubernetes Fundamentals": 35, "Container Orchestration": 25,
		"Cloud Native Application Delivery": 15,
		"Cloud Native Architecture":         7, // needs 8, only 7 authored
	}
	e := poolFixture(t, kcnaDomainOrder, kcnaWeights, poolSizes, 65)
	if _, err := DrawMCQ(e); err == nil {
		t.Error("DrawMCQ with a shallow Architecture pool: got nil error, want one naming the shortfall")
	}
}

func TestLoadMCQExamLengthExceedingPoolErrors(t *testing.T) {
	_, err := loadMCQDoc(t, `"examType": "mcq", "examLength": 3,`,
		mcqQuestion("q01", false, 4, []int{0}),
		mcqQuestion("q02", false, 4, []int{0}),
	)
	if err == nil || !strings.Contains(err.Error(), "examLength") {
		t.Errorf("Load with examLength 3 > pool of 2: err = %v, want it to mention examLength", err)
	}
}

func TestSpeedDurationDefaultsToHalf(t *testing.T) {
	ex, err := Load(examJSON, bankDir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if ex.SpeedDuration != ex.Duration/2 {
		t.Errorf("SpeedDuration = %v, want half of %v", ex.SpeedDuration, ex.Duration)
	}
}

// Domains is the ordered form of spec.domainWeights the graders weight
// with: question order, never map order, and one entry per domain the
// questions actually use.
func TestLoadDomains(t *testing.T) {
	ex, err := Load("testdata/exam-mcq.json", "testdata/bank-mcq")
	if err != nil {
		t.Fatalf("Load mcq fixture: %v", err)
	}
	want := []Domain{
		// q01 is Fundamentals and comes first in the file; the weights map
		// lists Orchestration first, and must not decide the order.
		{Name: "Kubernetes Fundamentals", WeightPct: 60},
		{Name: "Container Orchestration", WeightPct: 40},
	}
	if !reflect.DeepEqual(ex.Domains, want) {
		t.Errorf("Domains = %+v, want %+v", ex.Domains, want)
	}
}

// A bank with no spec.domainWeights still gets its domains listed, at
// weight 0 — "this bank publishes no curriculum split", which is what
// makes the graders fall back to weighting by points.
func TestLoadDomainsWithoutWeights(t *testing.T) {
	ex, err := Load(examJSON, bankDir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	want := []Domain{
		{Name: "Application Deployment"},
		{Name: "Application Environment, Configuration and Security"},
	}
	if !reflect.DeepEqual(ex.Domains, want) {
		t.Errorf("Domains = %+v, want %+v", ex.Domains, want)
	}
}

func TestSubset(t *testing.T) {
	ex := &Exam{Questions: []Question{{ID: "q01"}, {ID: "q02"}, {ID: "q03"}}}

	// Empty ids means "no subset was drawn": the whole bank, in order.
	if got := Subset(ex, nil); len(got) != 3 || got[0].ID != "q01" || got[2].ID != "q03" {
		t.Errorf("Subset(nil) = %+v, want all three in bank order", got)
	}

	// Draw order wins over bank order, and an id the bank does not
	// declare is skipped rather than faked into an empty question.
	got := Subset(ex, []string{"q03", "q99", "q01"})
	if len(got) != 2 || got[0].ID != "q03" || got[1].ID != "q01" {
		t.Errorf("Subset([q03 q99 q01]) = %+v, want [q03 q01]", got)
	}
}
