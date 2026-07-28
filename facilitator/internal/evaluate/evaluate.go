// Package evaluate grades a candidate's exam by running each question's
// validate.d checks over ssh against the question's instance, replacing
// images/k8s-env/grade.sh with an equivalent Go implementation.
//
// Grade produces a Results value that serves two purposes: it is the JSON
// payload for the score-page API, and its Scoreboard method renders the
// exact plain-text shape grade.sh printed to stdout (including the final
// "RESULT <earned> <total> <pct>" line tests/smoke.sh greps for), so
// operators and scripts depending on that output see no behavioral change.
package evaluate

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"kubestronaut-sim/facilitator/internal/exam"
)

// Runner executes a single validate.d check's shell command on instance
// and reports its outcome. ok is false when the remote command exited
// non-zero (a failed check, indistinguishable from a wrong answer); err
// is reserved for a transport-level failure that prevented the command
// from running or completing at all (e.g. ssh couldn't even start, or
// ctx's deadline elapsed). Both ok=false and err!=nil score the check as
// 0 points — grade.sh does not distinguish "wrong answer" from
// "unreachable instance" either, since both make the remote command exit
// non-zero.
type Runner interface {
	Run(ctx context.Context, instance, cmd string) (out string, ok bool, err error)
}

// sshRunner is the production Runner: it shells out to the ssh binary
// with grade.sh's exact flags, using os/exec instead of an SSH client
// library so the facilitator stays stdlib-only.
type sshRunner struct {
	keyPath string
}

// NewSSHRunner returns a Runner that runs each check via the ssh binary,
// authenticating with the private key at keyPath.
func NewSSHRunner(keyPath string) Runner {
	return &sshRunner{keyPath: keyPath}
}

// Run shells out to `ssh <flags> root@<instance> <cmd>` and reports its
// combined stdout+stderr. A non-zero ssh exit status (whether from the
// remote command failing or ssh itself being unable to connect) is
// reported as ok=false, err=nil, mirroring grade.sh's `$? -eq 0` check.
// Any other failure (e.g. the ssh binary not found, or ctx's deadline
// killing the process) is reported as err!=nil.
func (s *sshRunner) Run(ctx context.Context, instance, cmd string) (string, bool, error) {
	out, err := exec.CommandContext(ctx, "ssh", sshArgs(s.keyPath, instance, cmd)...).CombinedOutput()
	if err == nil {
		return string(out), true, nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return string(out), false, nil
	}
	return string(out), false, fmt.Errorf("evaluate: ssh: %w", err)
}

// sshArgs builds the ssh argv (excluding the binary name itself) for
// running cmd on instance, matching images/k8s-env/grade.sh's $SSH
// invocation exactly. Extracted from Run so it is unit-testable without
// actually running ssh.
func sshArgs(keyPath, instance, cmd string) []string {
	return []string{
		"-o", "StrictHostKeyChecking=no",
		"-o", "UserKnownHostsFile=/dev/null",
		"-o", "LogLevel=ERROR",
		"-o", "BatchMode=yes",
		"-o", "ConnectTimeout=10",
		"-i", keyPath,
		"root@" + instance,
		cmd,
	}
}

// remoteCommand builds the remote command string grade.sh runs for one
// validate.d script.
//
// BANK is exported alongside KUBECONFIG so a check can reach its own
// bank's pristine files under /banks/$BANK/<qid>/files. That is what
// makes "the candidate must not have modified this file" checkable by
// comparing against the original, rather than by grepping for a line
// that happened to be in it — which made the check whitespace-exact on
// a YAML file it had no business reading as text.
func remoteCommand(bank, qid, script string) string {
	return fmt.Sprintf("KUBECONFIG=/home/candidate/.kube/config BANK=%s bash /banks/%s/%s/validate.d/%s", bank, bank, qid, script)
}

// Results is a fully graded exam: totals, pass/fail, and the per-question
// breakdown. Its JSON tags are the score-page API's results schema.
type Results struct {
	Bank         string           `json:"bank"`
	GradedAt     time.Time        `json:"gradedAt"`
	Earned       int              `json:"earned"`
	Total        int              `json:"total"`
	Percent      int              `json:"percent"`
	PassingScore int              `json:"passingScore"`
	Passed       bool             `json:"passed"`
	Questions    []QuestionResult `json:"questions"`
}

// QuestionResult is one question's graded outcome.
type QuestionResult struct {
	ID       string        `json:"id"`
	Instance string        `json:"instance"`
	Domain   string        `json:"domain"`
	Earned   int           `json:"earned"`
	Total    int           `json:"total"`
	Checks   []CheckResult `json:"checks"`
}

// CheckResult is one validate.d check's graded outcome.
type CheckResult struct {
	Name    string `json:"name"`
	Desc    string `json:"desc"`
	Points  int    `json:"points"`
	Earned  int    `json:"earned"`
	Passed  bool   `json:"passed"`
	Message string `json:"message"`

	// skip marks a check whose "# points:" header was invalid
	// (exam.Check.Skip): it was never run, and Scoreboard prints it as
	// [SKIP] rather than [PASS]/[FAIL]. It is deliberately unexported —
	// the score-page API's schema has no field for exam-authoring
	// mistakes, only grade.sh's plain-text Scoreboard output does.
	skip bool
}

// Grade runs every check in ex against r, scoping each to checkTimeout,
// and returns the resulting Results. Questions and checks are graded in
// the order ex provides (bank file order / lexical validate.d order); a
// check with Skip set is never run and contributes nothing to either
// question's or the exam's totals.
func Grade(ex *exam.Exam, bank string, r Runner, checkTimeout time.Duration) *Results {
	res := &Results{
		Bank:         bank,
		GradedAt:     time.Now(),
		PassingScore: ex.PassingScore,
	}

	for _, q := range ex.Questions {
		qr := QuestionResult{ID: q.ID, Instance: q.Instance, Domain: q.Domain}

		for _, c := range q.Checks {
			if c.Skip {
				qr.Checks = append(qr.Checks, CheckResult{Name: c.Name, Desc: c.Desc, skip: true})
				continue
			}
			cr := gradeCheck(r, bank, q, c, checkTimeout)
			qr.Checks = append(qr.Checks, cr)
			qr.Total += cr.Points
			qr.Earned += cr.Earned
		}

		res.Questions = append(res.Questions, qr)
		res.Total += qr.Total
		res.Earned += qr.Earned
	}

	if res.Total > 0 {
		res.Percent = res.Earned * 100 / res.Total
	}
	res.Passed = res.Percent >= res.PassingScore

	return res
}

// gradeCheck runs a single non-skipped check against r under a
// checkTimeout deadline and reports its CheckResult. Precedence when
// something goes wrong: a ctx deadline always reports "check timed out"
// (regardless of what r itself returned, since r may not distinguish its
// own cancellation-induced error from any other); otherwise a non-nil err
// reports err's text; otherwise ok determines pass/fail, with out
// (trimmed of trailing newlines, matching bash's $(...) command
// substitution) as the message either way.
func gradeCheck(r Runner, bank string, q exam.Question, c exam.Check, checkTimeout time.Duration) CheckResult {
	ctx, cancel := context.WithTimeout(context.Background(), checkTimeout)
	defer cancel()

	out, ok, err := r.Run(ctx, q.Instance, remoteCommand(bank, q.ID, c.Name))

	cr := CheckResult{Name: c.Name, Desc: c.Desc, Points: c.Points}
	switch {
	// Deliberate precedence tradeoff: ctx.Err() is read only after Run
	// has already returned, so a check whose Run call completes within
	// a hair of checkTimeout can still observe ctx.Err() != nil (the
	// deadline fired concurrently, just after Run finished) and be
	// reported as "check timed out" even though it actually finished in
	// time. Accepted at the current 30s per-check timeout: narrowing
	// this window is not worth the added complexity.
	case ctx.Err() != nil:
		cr.Message = "check timed out"
	case err != nil:
		cr.Message = err.Error()
	default:
		cr.Message = strings.TrimRight(out, "\n")
		if ok {
			cr.Passed = true
			cr.Earned = c.Points
		}
	}
	return cr
}

// Scoreboard renders r in images/k8s-env/grade.sh's exact plain-text
// shape, including its final "RESULT <earned> <total> <pct>" line that
// tests/smoke.sh greps for.
func (r *Results) Scoreboard() string {
	var b strings.Builder

	fmt.Fprintf(&b, "=== %s results ===\n", r.Bank)
	for _, q := range r.Questions {
		b.WriteString("\n")
		fmt.Fprintf(&b, "-- %s (on %s)\n", q.ID, q.Instance)
		for _, c := range q.Checks {
			switch {
			case c.skip:
				fmt.Fprintf(&b, "  [SKIP] %s: bad '# points:' header\n", c.Name)
			case c.Passed:
				fmt.Fprintf(&b, "  [PASS] %s (%d pts) — %s\n", c.Desc, c.Points, c.Message)
			default:
				fmt.Fprintf(&b, "  [FAIL] %s (0/%d pts) — %s\n", c.Desc, c.Points, c.Message)
			}
		}
	}
	b.WriteString("\n")
	fmt.Fprintf(&b, "=== Score: %d/%d (%d%%) ===\n", r.Earned, r.Total, r.Percent)
	fmt.Fprintf(&b, "RESULT %d %d %d\n", r.Earned, r.Total, r.Percent)

	return b.String()
}
