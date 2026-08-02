package evaluate

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"

	"kubestronaut-sim/facilitator/internal/exam"
)

// call records one Runner.Run invocation, so tests can assert exactly
// which instance/cmd Grade composed.
type call struct {
	instance string
	cmd      string
}

// resp is a canned Runner.Run return value.
type resp struct {
	out string
	ok  bool
	err error
}

// fakeRunner resolves each call by matching the trailing path segment of
// cmd (the check script's basename) against byName, and records every
// call it receives.
type fakeRunner struct {
	byName map[string]resp
	calls  []call
}

func (f *fakeRunner) Run(_ context.Context, instance, cmd string) (string, bool, error) {
	f.calls = append(f.calls, call{instance, cmd})
	for name, r := range f.byName {
		if strings.HasSuffix(cmd, "/"+name) {
			return r.out, r.ok, r.err
		}
	}
	return "", false, fmt.Errorf("fakeRunner: no response configured for cmd %q", cmd)
}

// blockingRunner never returns until ctx is done, simulating an
// unreachable/hung instance so Grade's per-check timeout can be
// exercised without any real sleep beyond the tiny checkTimeout the test
// supplies.
type blockingRunner struct{}

func (blockingRunner) Run(ctx context.Context, _, _ string) (string, bool, error) {
	<-ctx.Done()
	return "", false, ctx.Err()
}

func TestGrade(t *testing.T) {
	cases := []struct {
		name        string
		ex          *exam.Exam
		runner      *fakeRunner
		wantEarned  int
		wantTotal   int
		wantPercent int
		wantPassed  bool
		wantCalls   int
	}{
		{
			name: "all pass: full score",
			ex: &exam.Exam{
				PassingScore: 100,
				Questions: []exam.Question{
					{ID: "q01", Instance: "instance-1", Checks: []exam.Check{
						{Name: "10_a.sh", Desc: "a", Points: 3},
						{Name: "20_b.sh", Desc: "b", Points: 4},
					}},
				},
			},
			runner: &fakeRunner{byName: map[string]resp{
				"10_a.sh": {out: "ok\n", ok: true},
				"20_b.sh": {out: "ok\n", ok: true},
			}},
			wantEarned:  7,
			wantTotal:   7,
			wantPercent: 100,
			wantPassed:  true,
			wantCalls:   2,
		},
		{
			name: "all fail: zero score",
			ex: &exam.Exam{
				PassingScore: 50,
				Questions: []exam.Question{
					{ID: "q01", Instance: "instance-1", Checks: []exam.Check{
						{Name: "10_a.sh", Desc: "a", Points: 3},
						{Name: "20_b.sh", Desc: "b", Points: 4},
					}},
				},
			},
			runner: &fakeRunner{byName: map[string]resp{
				"10_a.sh": {out: "nope\n", ok: false},
				"20_b.sh": {out: "nope\n", ok: false},
			}},
			wantEarned:  0,
			wantTotal:   7,
			wantPercent: 0,
			wantPassed:  false,
			wantCalls:   2,
		},
		{
			name: "partial score floors percent (5/17 -> 29)",
			ex: &exam.Exam{
				PassingScore: 30,
				Questions: []exam.Question{
					{ID: "q01", Instance: "instance-1", Checks: []exam.Check{
						{Name: "10_a.sh", Desc: "a", Points: 5},
						{Name: "20_b.sh", Desc: "b", Points: 12},
					}},
				},
			},
			runner: &fakeRunner{byName: map[string]resp{
				"10_a.sh": {out: "ok", ok: true},
				"20_b.sh": {out: "no", ok: false},
			}},
			wantEarned:  5,
			wantTotal:   17,
			wantPercent: 29,
			wantPassed:  false, // 29 < 30
			wantCalls:   2,
		},
		{
			name: "passed boundary: percent == passingScore passes",
			ex: &exam.Exam{
				PassingScore: 60,
				Questions: []exam.Question{
					{ID: "q01", Instance: "instance-1", Checks: []exam.Check{
						{Name: "10_a.sh", Desc: "a", Points: 6},
						{Name: "20_b.sh", Desc: "b", Points: 4},
					}},
				},
			},
			runner: &fakeRunner{byName: map[string]resp{
				"10_a.sh": {out: "ok", ok: true},
				"20_b.sh": {out: "no", ok: false},
			}},
			wantEarned:  6,
			wantTotal:   10,
			wantPercent: 60,
			wantPassed:  true,
			wantCalls:   2,
		},
		{
			name: "SKIP checks excluded from total and not run",
			ex: &exam.Exam{
				PassingScore: 100,
				Questions: []exam.Question{
					{ID: "q01", Instance: "instance-1", Checks: []exam.Check{
						{Name: "10_a.sh", Desc: "a", Points: 5},
						{Name: "20_bad.sh", Skip: true},
					}},
				},
			},
			runner: &fakeRunner{byName: map[string]resp{
				"10_a.sh": {out: "ok", ok: true},
			}},
			wantEarned:  5,
			wantTotal:   5,
			wantPercent: 100,
			wantPassed:  true,
			wantCalls:   1, // the SKIP check must never reach the Runner
		},
		{
			name: "all checks skipped: total 0 -> RESULT 0 0 0",
			ex: &exam.Exam{
				PassingScore: 0,
				Questions: []exam.Question{
					{ID: "q01", Instance: "instance-1", Checks: []exam.Check{
						{Name: "10_bad.sh", Skip: true},
					}},
				},
			},
			runner:      &fakeRunner{byName: map[string]resp{}},
			wantEarned:  0,
			wantTotal:   0,
			wantPercent: 0,
			wantPassed:  true, // 0 >= passingScore 0
			wantCalls:   0,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			res := Grade(c.ex, "bank", c.runner, time.Second, nil)

			if res.Earned != c.wantEarned || res.Total != c.wantTotal ||
				res.Percent != c.wantPercent || res.Passed != c.wantPassed {
				t.Errorf("Grade() = {Earned:%d Total:%d Percent:%d Passed:%v}, want {%d %d %d %v}",
					res.Earned, res.Total, res.Percent, res.Passed,
					c.wantEarned, c.wantTotal, c.wantPercent, c.wantPassed)
			}
			if len(c.runner.calls) != c.wantCalls {
				t.Errorf("Runner.Run called %d times, want %d", len(c.runner.calls), c.wantCalls)
			}
		})
	}
}

func TestGradeCheckResultFields(t *testing.T) {
	ex := &exam.Exam{
		PassingScore: 50,
		Questions: []exam.Question{
			{ID: "q01", Instance: "instance-1", Domain: "Storage", Checks: []exam.Check{
				{Name: "10_pass.sh", Desc: "pass check", Points: 3},
				{Name: "20_fail.sh", Desc: "fail check", Points: 4},
			}},
		},
	}
	runner := &fakeRunner{byName: map[string]resp{
		// grade.sh's msg=$(...) strips ALL trailing newlines.
		"10_pass.sh": {out: "all good\n\n", ok: true},
		"20_fail.sh": {out: "broke\n", ok: false},
	}}

	res := Grade(ex, "ckad-mock-01", runner, time.Second, nil)

	if len(res.Questions) != 1 {
		t.Fatalf("len(Questions) = %d, want 1", len(res.Questions))
	}
	q := res.Questions[0]
	if q.ID != "q01" || q.Instance != "instance-1" || q.Domain != "Storage" {
		t.Errorf("question identity = %+v, want ID=q01 Instance=instance-1 Domain=Storage", q)
	}
	if q.Earned != 3 || q.Total != 7 {
		t.Errorf("question totals = earned:%d total:%d, want 3/7", q.Earned, q.Total)
	}
	if len(q.Checks) != 2 {
		t.Fatalf("len(Checks) = %d, want 2", len(q.Checks))
	}

	pass, fail := q.Checks[0], q.Checks[1]
	if pass.Name != "10_pass.sh" || pass.Desc != "pass check" || pass.Points != 3 ||
		pass.Earned != 3 || !pass.Passed || pass.Message != "all good" {
		t.Errorf("pass check = %+v, want Name=10_pass.sh Desc=%q Points=3 Earned=3 Passed=true Message=%q",
			pass, "pass check", "all good")
	}
	if fail.Name != "20_fail.sh" || fail.Desc != "fail check" || fail.Points != 4 ||
		fail.Earned != 0 || fail.Passed || fail.Message != "broke" {
		t.Errorf("fail check = %+v, want Name=20_fail.sh Desc=%q Points=4 Earned=0 Passed=false Message=%q",
			fail, "fail check", "broke")
	}
}

func TestGradeComposesRemoteCommand(t *testing.T) {
	ex := &exam.Exam{
		Questions: []exam.Question{
			{ID: "q01", Instance: "instance-1", Checks: []exam.Check{
				{Name: "10_ok.sh", Desc: "x", Points: 3},
			}},
		},
	}
	runner := &fakeRunner{byName: map[string]resp{
		"10_ok.sh": {out: "ok", ok: true},
	}}

	Grade(ex, "ckad-mock-01", runner, time.Second, nil)

	if len(runner.calls) != 1 {
		t.Fatalf("calls = %d, want 1", len(runner.calls))
	}
	want := call{
		instance: "instance-1",
		cmd:      "KUBECONFIG=/home/candidate/.kube/config BANK=ckad-mock-01 bash /banks/ckad-mock-01/q01/validate.d/10_ok.sh",
	}
	if runner.calls[0] != want {
		t.Errorf("call = %+v, want %+v", runner.calls[0], want)
	}
}

func TestGradeCheckTimeout(t *testing.T) {
	ex := &exam.Exam{
		Questions: []exam.Question{
			{ID: "q01", Instance: "instance-1", Checks: []exam.Check{
				{Name: "10_slow.sh", Desc: "slow", Points: 5},
			}},
		},
	}

	res := Grade(ex, "bank", blockingRunner{}, 10*time.Millisecond, nil)

	c := res.Questions[0].Checks[0]
	if c.Message != "check timed out" {
		t.Errorf("Message = %q, want %q", c.Message, "check timed out")
	}
	if c.Passed || c.Earned != 0 {
		t.Errorf("timed-out check = %+v, want Passed=false Earned=0", c)
	}
	if res.Total != 5 || res.Earned != 0 {
		t.Errorf("Results totals = earned:%d total:%d, want 0/5", res.Earned, res.Total)
	}
}

func TestGradeRunnerTransportError(t *testing.T) {
	wantErr := errors.New("dial tcp: connection refused")
	ex := &exam.Exam{
		Questions: []exam.Question{
			{ID: "q01", Instance: "instance-1", Checks: []exam.Check{
				{Name: "10_a.sh", Desc: "a", Points: 5},
			}},
		},
	}
	runner := &fakeRunner{byName: map[string]resp{
		"10_a.sh": {err: wantErr},
	}}

	res := Grade(ex, "bank", runner, time.Second, nil)

	c := res.Questions[0].Checks[0]
	if c.Message != wantErr.Error() {
		t.Errorf("Message = %q, want %q", c.Message, wantErr.Error())
	}
	if c.Passed || c.Earned != 0 {
		t.Errorf("errored check = %+v, want Passed=false Earned=0", c)
	}
	if res.Total != 5 || res.Earned != 0 {
		t.Errorf("Results totals = earned:%d total:%d, want 0/5", res.Earned, res.Total)
	}
}

func TestScoreboardGolden(t *testing.T) {
	ex := &exam.Exam{
		PassingScore: 50,
		Questions: []exam.Question{
			{ID: "q01", Instance: "instance-1", Checks: []exam.Check{
				{Name: "10_ok.sh", Desc: "x", Points: 3},
				{Name: "20_bad.sh", Skip: true},
			}},
			{ID: "q02", Instance: "instance-2", Checks: []exam.Check{
				{Name: "10_two.sh", Desc: "y", Points: 2},
			}},
		},
	}
	runner := &fakeRunner{byName: map[string]resp{
		"10_ok.sh":  {out: "ok\n", ok: true},
		"10_two.sh": {out: "bad\n", ok: false},
	}}

	res := Grade(ex, "ckad-mock-01", runner, time.Second, nil)

	want := "=== ckad-mock-01 results ===\n" +
		"\n" +
		"-- q01 (on instance-1)\n" +
		"  [PASS] x (3 pts) — ok\n" +
		"  [SKIP] 20_bad.sh: bad '# points:' header\n" +
		"\n" +
		"-- q02 (on instance-2)\n" +
		"  [FAIL] y (0/2 pts) — bad\n" +
		"\n" +
		"=== Score: 3/5 (60%) ===\n" +
		"RESULT 3 5 60\n"

	if got := res.Scoreboard(); got != want {
		t.Errorf("Scoreboard() =\n%s\nwant:\n%s", got, want)
	}
}

// A pooled/filtered attempt is graded on exactly its drawn subset: a
// question outside it is never even ssh'd for, and cannot appear in the
// results or inflate the total. The bank is not the exam.
func TestGradeScopesToQuestionIDs(t *testing.T) {
	ex := &exam.Exam{
		PassingScore: 50,
		Questions: []exam.Question{
			{ID: "q01", Instance: "instance-1", Domain: "A", Checks: []exam.Check{
				{Name: "10_a.sh", Desc: "a", Points: 4},
			}},
			{ID: "q02", Instance: "instance-2", Domain: "B", Checks: []exam.Check{
				{Name: "10_b.sh", Desc: "b", Points: 6},
			}},
			{ID: "q03", Instance: "instance-1", Domain: "A", Checks: []exam.Check{
				{Name: "10_c.sh", Desc: "c", Points: 5},
			}},
		},
	}
	runner := &fakeRunner{byName: map[string]resp{
		"10_a.sh": {out: "ok", ok: true},
		"10_b.sh": {out: "ok", ok: true},
		"10_c.sh": {out: "ok", ok: true},
	}}

	res := Grade(ex, "bank", runner, time.Second, []string{"q03", "q01"})

	if len(res.Questions) != 2 {
		t.Fatalf("len(Questions) = %d, want 2 (only the drawn subset)", len(res.Questions))
	}
	if res.Questions[0].ID != "q03" || res.Questions[1].ID != "q01" {
		t.Errorf("Questions ids = [%s %s], want [q03 q01] (draw order preserved)",
			res.Questions[0].ID, res.Questions[1].ID)
	}
	if res.Total != 9 || res.Earned != 9 {
		t.Errorf("totals = %d/%d, want 9/9 (q02's 6 points excluded)", res.Earned, res.Total)
	}
	// The undrawn question must not be graded — checking work the
	// candidate was never shown is the bug this scoping exists for.
	for _, c := range runner.calls {
		if strings.Contains(c.cmd, "10_b.sh") {
			t.Errorf("Runner ran %q, want no check from the undrawn q02", c.cmd)
		}
	}
	if len(runner.calls) != 2 {
		t.Errorf("Runner.Run called %d times, want 2", len(runner.calls))
	}
}

// The curriculum weights decide the score, not the points the drawn
// questions happen to carry: here Storage holds 3 of 13 points but 50% of
// the curriculum, so a candidate who aced it and failed everything else
// scores 50, not 23.
func TestGradeWeightsByCurriculumDomain(t *testing.T) {
	ex := &exam.Exam{
		PassingScore: 50,
		Domains: []exam.Domain{
			{Name: "Storage", WeightPct: 50},
			{Name: "Networking", WeightPct: 50},
		},
		Questions: []exam.Question{
			{ID: "q01", Instance: "instance-1", Domain: "Storage", Checks: []exam.Check{
				{Name: "10_a.sh", Desc: "a", Points: 3},
			}},
			{ID: "q02", Instance: "instance-1", Domain: "Networking", Checks: []exam.Check{
				{Name: "10_b.sh", Desc: "b", Points: 10},
			}},
		},
	}
	runner := &fakeRunner{byName: map[string]resp{
		"10_a.sh": {out: "ok", ok: true},
		"10_b.sh": {out: "no", ok: false},
	}}

	res := Grade(ex, "bank", runner, time.Second, nil)

	if res.Percent != 50 {
		t.Errorf("Percent = %d, want 50 (Storage is half the curriculum)", res.Percent)
	}
	if res.PointsPercent != 23 {
		t.Errorf("PointsPercent = %d, want 23 (3 of 13 points)", res.PointsPercent)
	}
	if !res.Passed {
		t.Errorf("Passed = false, want true — the weighted score is what decides")
	}
}

// Finalize is where every derived field comes from, so it is tested
// directly: the graders only fill in Earned/Total per question.
func TestFinalizeDomainRollup(t *testing.T) {
	res := &Results{
		PassingScore: 60,
		Questions: []QuestionResult{
			{ID: "q01", Domain: "Storage", Earned: 4, Total: 4},
			{ID: "q02", Domain: "Networking", Earned: 1, Total: 6},
			{ID: "q03", Domain: "Storage", Earned: 0, Total: 4},
		},
	}

	res.Finalize([]exam.Domain{
		{Name: "Storage", WeightPct: 30},
		{Name: "Networking", WeightPct: 70},
		// Declared but undrawn: it is not part of what was graded, so it
		// must neither appear in the rollup nor dilute the weighting.
		{Name: "Observability", WeightPct: 0},
	})

	want := []DomainResult{
		{Domain: "Storage", Earned: 4, Total: 8, WeightPct: 30, QuestionCount: 2},
		{Domain: "Networking", Earned: 1, Total: 6, WeightPct: 70, QuestionCount: 1},
	}
	if !reflect.DeepEqual(res.Domains, want) {
		t.Errorf("Domains = %+v, want %+v", res.Domains, want)
	}
	if res.Earned != 5 || res.Total != 14 {
		t.Errorf("totals = %d/%d, want 5/14", res.Earned, res.Total)
	}
	// 30% * 4/8 + 70% * 1/6 = 15 + 11.67 = 26.67, floored.
	if res.Percent != 26 {
		t.Errorf("Percent = %d, want 26", res.Percent)
	}
	if res.PointsPercent != 35 {
		t.Errorf("PointsPercent = %d, want 35 (5 of 14 points)", res.PointsPercent)
	}
	// Each question's share is its domain's, split by points: Storage's
	// 30 points over two 4-point questions is 15 each.
	for i, want := range []float64{15, 70, 15} {
		if got := res.Questions[i].WeightPct; got != want {
			t.Errorf("Questions[%d].WeightPct = %v, want %v", i, got, want)
		}
	}
}

// Every question's share of the exam must add up to the whole exam, or
// "worth 4.5% of the exam" is not a statement anyone can trust.
func TestFinalizeWeightPctSumsTo100(t *testing.T) {
	res := &Results{
		Questions: []QuestionResult{
			{ID: "q01", Domain: "A", Earned: 0, Total: 3},
			{ID: "q02", Domain: "A", Earned: 0, Total: 5},
			{ID: "q03", Domain: "B", Earned: 0, Total: 7},
			{ID: "q04", Domain: "C", Earned: 0, Total: 1},
		},
	}
	res.Finalize([]exam.Domain{
		{Name: "A", WeightPct: 44}, {Name: "B", WeightPct: 28}, {Name: "C", WeightPct: 28},
	})

	sum := 0.0
	for _, q := range res.Questions {
		sum += q.WeightPct
	}
	if diff := sum - 100; diff > 1e-9 || diff < -1e-9 {
		t.Errorf("question WeightPct sums to %v, want 100", sum)
	}
	sum = 0
	for _, d := range res.Domains {
		sum += d.WeightPct
	}
	if diff := sum - 100; diff > 1e-9 || diff < -1e-9 {
		t.Errorf("domain WeightPct sums to %v, want 100", sum)
	}
}

// Only some domains carry a weight → the whole attempt falls back to
// points, rather than inventing a curriculum share for the rest.
func TestFinalizeFallsBackToPointsWithoutFullWeights(t *testing.T) {
	cases := []struct {
		name    string
		domains []exam.Domain
	}{
		{"no weights at all", []exam.Domain{{Name: "A"}, {Name: "B"}}},
		{"partial weights", []exam.Domain{{Name: "A", WeightPct: 60}, {Name: "B"}}},
		{"domains unknown to the bank", nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			res := &Results{
				Questions: []QuestionResult{
					{ID: "q01", Domain: "A", Earned: 3, Total: 3},
					{ID: "q02", Domain: "B", Earned: 0, Total: 10},
				},
			}
			res.Finalize(c.domains)

			if res.Percent != res.PointsPercent {
				t.Errorf("Percent = %d, PointsPercent = %d — an unweighted bank must score by points",
					res.Percent, res.PointsPercent)
			}
			if res.Percent != 23 {
				t.Errorf("Percent = %d, want 23 (3 of 13 points)", res.Percent)
			}
		})
	}
}

// A weighted score that lands exactly on the pass mark must pass. In
// float64 this exam computes as 49.99999999999999 and would fail a
// candidate who scored exactly 50, which is why the weighting is done in
// exact rationals.
func TestFinalizeWeightedPercentIsExact(t *testing.T) {
	res := &Results{
		PassingScore: 50,
		Questions: []QuestionResult{
			{ID: "q01", Domain: "A", Earned: 1, Total: 3},
			{ID: "q02", Domain: "B", Earned: 2, Total: 3},
		},
	}
	res.Finalize([]exam.Domain{{Name: "A", WeightPct: 50}, {Name: "B", WeightPct: 50}})

	if res.Percent != 50 {
		t.Errorf("Percent = %d, want 50 (50%%*1/3 + 50%%*2/3 is exactly 50)", res.Percent)
	}
	if !res.Passed {
		t.Errorf("Passed = false, want true at exactly the passing score")
	}
}

// The shipped ckad-mock-01 shape: five domains whose point budgets
// already sit exactly in the curriculum's ratios, which is what
// tests/bank-weights.sh holds them to. On a full-bank attempt weighting
// must therefore be a no-op — same number, whatever the candidate
// scored. That parity is what keeps the smoke suite's RESULT line, the
// fresh-environment-scores-0 gate and the solutions-score-100% gate
// talking about the same score after this change.
func TestFinalizeIsANoOpOnAFullCKADBank(t *testing.T) {
	domains := []exam.Domain{
		{Name: "Application Environment, Configuration and Security", WeightPct: 25},
		{Name: "Application Deployment", WeightPct: 20},
		{Name: "Services and Networking", WeightPct: 20},
		{Name: "Application Design and Build", WeightPct: 20},
		{Name: "Application Observability and Maintenance", WeightPct: 15},
	}
	// Points per domain in the real bank: 5x9, 4x9, 4x9, 6x6, 3x9 = 180.
	shape := []struct {
		domain string
		count  int
		points int
	}{
		{domains[0].Name, 5, 9}, {domains[1].Name, 4, 9}, {domains[2].Name, 4, 9},
		{domains[3].Name, 6, 6}, {domains[4].Name, 3, 9},
	}
	// Earned points per domain, chosen to be lopsided: a candidate who is
	// strong in one domain and weak in another is exactly the case where
	// a mis-weighted score would show up.
	for _, earned := range [][]int{
		{45, 36, 36, 36, 27}, // everything
		{0, 0, 0, 0, 0},      // a fresh environment
		{45, 0, 0, 0, 0},     // one domain only
		{31, 22, 9, 30, 4},
		{9, 36, 36, 6, 27},
	} {
		res := &Results{PassingScore: 66}
		for i, s := range shape {
			left := earned[i]
			for n := 0; n < s.count; n++ {
				got := min(left, s.points)
				left -= got
				res.Questions = append(res.Questions, QuestionResult{
					ID: fmt.Sprintf("%s-%d", s.domain, n), Domain: s.domain,
					Earned: got, Total: s.points,
				})
			}
		}
		res.Finalize(domains)
		if res.Percent != res.PointsPercent {
			t.Errorf("earned %v: Percent = %d, PointsPercent = %d — weighting must not move a full-bank ckad score",
				earned, res.Percent, res.PointsPercent)
		}
	}
}

func TestFinalizeVerdicts(t *testing.T) {
	res := &Results{
		Questions: []QuestionResult{
			{ID: "q01", Domain: "A", Earned: 4, Total: 4},
			{ID: "q02", Domain: "A", Earned: 1, Total: 4},
			{ID: "q03", Domain: "A", Earned: 0, Total: 4},
			// Every check's "# points:" header was malformed, so nothing
			// was scorable. That is a broken bank, not a free pass.
			{ID: "q04", Domain: "A", Earned: 0, Total: 0},
		},
	}
	res.Finalize(nil)

	want := []string{VerdictCorrect, VerdictPartial, VerdictFailed, VerdictFailed}
	for i, w := range want {
		if got := res.Questions[i].Verdict; got != w {
			t.Errorf("Questions[%d] (%d/%d) Verdict = %q, want %q",
				i, res.Questions[i].Earned, res.Questions[i].Total, got, w)
		}
	}
}

// Finalize derives everything from Earned/Total, so calling it twice must
// change nothing — no double-counted totals, no rollup appended to itself.
func TestFinalizeIsIdempotent(t *testing.T) {
	res := &Results{
		PassingScore: 60,
		Questions: []QuestionResult{
			{ID: "q01", Domain: "A", Earned: 2, Total: 4},
			{ID: "q02", Domain: "B", Earned: 6, Total: 6},
		},
	}
	domains := []exam.Domain{{Name: "A", WeightPct: 25}, {Name: "B", WeightPct: 75}}

	res.Finalize(domains)
	first := *res
	firstDomains := append([]DomainResult(nil), res.Domains...)
	res.Finalize(domains)

	if res.Earned != first.Earned || res.Total != first.Total ||
		res.Percent != first.Percent || res.PointsPercent != first.PointsPercent {
		t.Errorf("second Finalize changed the totals: %+v, want %+v", res, first)
	}
	if !reflect.DeepEqual(res.Domains, firstDomains) {
		t.Errorf("second Finalize changed the rollup: %+v, want %+v", res.Domains, firstDomains)
	}
}

func TestRemoteCommand(t *testing.T) {
	got := remoteCommand("ckad-mock-01", "q01", "10_ok.sh")
	want := "KUBECONFIG=/home/candidate/.kube/config BANK=ckad-mock-01 bash /banks/ckad-mock-01/q01/validate.d/10_ok.sh"
	if got != want {
		t.Errorf("remoteCommand() = %q, want %q", got, want)
	}
}

func TestSSHArgs(t *testing.T) {
	got := sshArgs("/shared/ssh/id_ed25519", "instance-1", "echo hi")
	want := []string{
		"-o", "StrictHostKeyChecking=no",
		"-o", "UserKnownHostsFile=/dev/null",
		"-o", "LogLevel=ERROR",
		"-o", "BatchMode=yes",
		"-o", "ConnectTimeout=10",
		"-i", "/shared/ssh/id_ed25519",
		"root@instance-1",
		"echo hi",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("sshArgs(...) = %#v, want %#v", got, want)
	}
}

// NewSSHRunner must satisfy Runner; compile-time check.
var _ Runner = NewSSHRunner("/shared/ssh/id_ed25519")
