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
			res := Grade(c.ex, "bank", c.runner, time.Second)

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

	res := Grade(ex, "ckad-mock-01", runner, time.Second)

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

	Grade(ex, "ckad-mock-01", runner, time.Second)

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

	res := Grade(ex, "bank", blockingRunner{}, 10*time.Millisecond)

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

	res := Grade(ex, "bank", runner, time.Second)

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

	res := Grade(ex, "ckad-mock-01", runner, time.Second)

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
