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
	"math/big"
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
	Bank     string    `json:"bank"`
	GradedAt time.Time `json:"gradedAt"`
	Earned   int       `json:"earned"`
	Total    int       `json:"total"`
	// Percent is the score that decides Passed: the curriculum-weighted
	// percentage, where each domain contributes its published
	// spec.domainWeights share regardless of how many points the drawn
	// questions happened to put in it. PointsPercent is the raw
	// earned/total — what Percent alone used to mean. The two are equal
	// whenever the attempt's points already sit in the curriculum's
	// ratios, which for a full-bank hands-on attempt they do, by
	// tests/bank-weights.sh.
	Percent       int              `json:"percent"`
	PointsPercent int              `json:"pointsPercent"`
	PassingScore  int              `json:"passingScore"`
	Passed        bool             `json:"passed"`
	Questions     []QuestionResult `json:"questions"`
	// Domains is the per-domain rollup, in bank order, over the questions
	// this attempt was actually graded on. Computed here rather than in
	// the client because the weighting that produced Percent is the
	// server's arithmetic and a second implementation of it would be a
	// second answer. Omitted when nothing was graded.
	Domains []DomainResult `json:"domains,omitempty"`

	// Everything below describes the ATTEMPT rather than the score, and
	// is copied on by Describe so a result can be read without the
	// session that produced it — which is what an attempt history needs
	// and what the results banner already wants. All omitempty, like
	// every additive field before them: a result graded before they
	// existed is persisted verbatim and served back unchanged after an
	// upgrade, so no reader may assume they are present.
	Mode string `json:"mode,omitempty"`
	Seed string `json:"seed,omitempty"`
	// DomainFilter is the domains the draw was narrowed to; absent means
	// the whole curriculum.
	DomainFilter []string `json:"domainFilter,omitempty"`
	// DurationSeconds is the attempt's clock (0, hence absent, for an
	// untimed one) and ElapsedSeconds what was used of it.
	DurationSeconds int `json:"durationSeconds,omitempty"`
	ElapsedSeconds  int `json:"elapsedSeconds,omitempty"`
}

// Attempt is how an attempt was run: the configuration a Results value
// carries alongside the score so the two can be read together later.
type Attempt struct {
	Mode            string
	Seed            string
	DomainFilter    []string
	DurationSeconds int
	ElapsedSeconds  int
	// TimeSpent is qid → seconds the question was on screen
	// (session.Manager.TimeSpent). Absent entries are questions never
	// reported as focused, which score exactly as they always did.
	TimeSpent map[string]int
}

// Describe copies a's configuration onto r and fills in each question's
// timing pair — how long it was open, and how long it was meant to take.
//
// Separate from Grade, and called after it, because none of this is
// graded: both engines produce the same Results by completely different
// routes and neither should have to carry an attempt description through
// its scoring loop to hand back unchanged at the end.
func (r *Results) Describe(ex *exam.Exam, a Attempt) {
	r.Mode = a.Mode
	r.Seed = a.Seed
	r.DomainFilter = a.DomainFilter
	r.DurationSeconds = a.DurationSeconds
	r.ElapsedSeconds = a.ElapsedSeconds

	byID := make(map[string]exam.Question, len(ex.Questions))
	for _, q := range ex.Questions {
		byID[q.ID] = q
	}
	for i, qr := range r.Questions {
		r.Questions[i].TimeSpentSeconds = a.TimeSpent[qr.ID]
		if q, ok := byID[qr.ID]; ok {
			r.Questions[i].TargetSeconds, _ = exam.TargetSeconds(ex, q)
		}
	}
}

// DomainResult is one curriculum domain's slice of a graded attempt.
type DomainResult struct {
	Domain string `json:"domain"`
	Earned int    `json:"earned"`
	Total  int    `json:"total"`
	// WeightPct is this domain's share of Percent, in percentage points —
	// its spec.domainWeights entry, renormalized when the attempt does
	// not cover the whole curriculum. Not rounded: format it for display.
	WeightPct     float64 `json:"weightPct"`
	QuestionCount int     `json:"questionCount"`
}

// QuestionResult is one question's graded outcome.
type QuestionResult struct {
	ID       string        `json:"id"`
	Title    string        `json:"title,omitempty"`
	Instance string        `json:"instance"`
	Domain   string        `json:"domain"`
	Earned   int           `json:"earned"`
	Total    int           `json:"total"`
	Checks   []CheckResult `json:"checks"`

	// WeightPct is this question's share of Percent, in percentage
	// points: its domain's weight split across that domain's questions in
	// proportion to their points. Every question's share sums to 100, so
	// "worth 4.5% of the exam" is a fact the score page can state rather
	// than infer from a point total whose scale it does not know.
	WeightPct float64 `json:"weightPct"`
	// Verdict is exactly "correct", "partial" or "failed" — the three
	// states a result row renders. Derived from Earned and Total, but
	// named here so the client is not the place that decides whether
	// 8-of-9 reads as a pass.
	Verdict string `json:"verdict"`

	// TimeSpentSeconds is how long this question was on screen, and
	// TargetSeconds the pacing budget to compare it against. Both are set
	// by Describe, not by grading.
	//
	// The first measures the TASK PANE, not attention: a candidate
	// reading the question while thinking in a terminal accrues time, and
	// one who walked away accrues a capped amount of it too. Every label
	// built from it has to say "open", never "spent" or "worked".
	TimeSpentSeconds int `json:"timeSpentSeconds,omitempty"`
	TargetSeconds    int `json:"targetSeconds,omitempty"`

	// MCQ only, set by internal/mcqgrade and absent (omitempty) from
	// hands-on results: the candidate's selections, the answer key, and
	// the option texts, so the score page can render an answer review
	// without re-fetching the question. The key reaches the client only
	// here — after grading — mirroring the solution.md gate.
	Selected []int    `json:"selected,omitempty"`
	Correct  []int    `json:"correct,omitempty"`
	Options  []string `json:"options,omitempty"`
	Multi    bool     `json:"multi,omitempty"`
}

// CheckResult is one validate.d check's graded outcome.
type CheckResult struct {
	Name    string `json:"name"`
	Desc    string `json:"desc"`
	Points  int    `json:"points"`
	Earned  int    `json:"earned"`
	Passed  bool   `json:"passed"`
	Message string `json:"message"`

	// Skipped marks a check whose "# points:" header was invalid
	// (exam.Check.Skip): it was never run. Scoreboard prints it as
	// [SKIP], and the score page renders it as "not graded" — without
	// this field a skipped check reached the client as passed:false,
	// points 0, message "", indistinguishable from a failure the
	// candidate should study.
	Skipped bool `json:"skipped,omitempty"`

	// Artifacts is the evidence the check attached to its own stdout —
	// what the cluster looked like, what it should have looked like, and
	// why the two differ. See artifact.go for the protocol. Present only
	// on a check that FAILED: a correct answer has nothing to explain,
	// and these documents are persisted by session.Manager.SetResults and
	// served back verbatim on every /api/results, so keeping them would
	// leave a copy of the cluster's state in the session file forever.
	Artifacts []CheckArtifact `json:"artifacts,omitempty"`
}

// Grade runs every check in ex against r, scoping each to checkTimeout,
// and returns the resulting Results. Questions and checks are graded in
// the order ex provides (bank file order / lexical validate.d order); a
// check with Skip set is never run and contributes nothing to either
// question's or the exam's totals.
//
// questionIDs is the attempt's drawn subset (session.Manager.QuestionIDs),
// exactly as mcqgrade.Grade takes it; empty means "no subset was drawn"
// and grades the whole bank. Grading the bank rather than the draw would
// ssh out to check work on questions the candidate was never shown and
// score them 0 — invisible while every hands-on attempt draws the whole
// bank, wrong the moment one does not.
func Grade(ex *exam.Exam, bank string, r Runner, checkTimeout time.Duration, questionIDs []string) *Results {
	res := &Results{
		Bank:         bank,
		GradedAt:     time.Now(),
		PassingScore: ex.PassingScore,
	}

	for _, q := range exam.Subset(ex, questionIDs) {
		qr := QuestionResult{ID: q.ID, Title: q.Title, Instance: q.Instance, Domain: q.Domain}

		for _, c := range q.Checks {
			if c.Skip {
				qr.Checks = append(qr.Checks, CheckResult{Name: c.Name, Desc: c.Desc, Skipped: true})
				continue
			}
			cr := gradeCheck(r, bank, q, c, checkTimeout)
			qr.Checks = append(qr.Checks, cr)
			qr.Total += cr.Points
			qr.Earned += cr.Earned
		}

		res.Questions = append(res.Questions, qr)
	}

	res.Finalize(ex.Domains)
	return res
}

// Verdict values. Exactly three, because a result row has exactly three
// states to render and an open-ended string would let a fourth appear in
// the client before anyone decided what it looks like.
const (
	VerdictCorrect = "correct"
	VerdictPartial = "partial"
	VerdictFailed  = "failed"
)

// Finalize fills in everything about r that is derived rather than
// measured: each question's verdict and share of the exam, the per-domain
// rollup, the totals, and both percentages. Callers grade questions into
// r.Questions and then call this once.
//
// It is exported because mcqgrade produces the same Results by a
// completely different route (a set comparison, no cluster) and must not
// grow a second opinion about what a weighted score is. It is idempotent:
// everything it writes is a function of r.Questions' Earned and Total.
//
// domains is ex.Domains — the curriculum weights. Weighting is applied
// here, at scoring time, rather than baked into the banks' point budgets,
// because a bank's points are fixed while a draw is not: filter an
// attempt to one domain, or draw half a bank, and the points in front of
// the candidate stop matching the published curriculum. The weights are
// the promise; the points are just how a question is subdivided.
func (r *Results) Finalize(domains []exam.Domain) {
	declared := make(map[string]int, len(domains))
	for _, d := range domains {
		declared[d.Name] = d.WeightPct
	}

	// Rollup in bank order, with any domain the questions use but
	// ex.Domains does not name appended in first-seen order — that is a
	// bank bug the offline gates fail on, and dropping its questions from
	// the rollup would hide points the candidate did earn.
	index := make(map[string]int, len(domains))
	r.Domains = nil
	add := func(name string) int {
		if i, ok := index[name]; ok {
			return i
		}
		index[name] = len(r.Domains)
		r.Domains = append(r.Domains, DomainResult{Domain: name})
		return index[name]
	}
	for _, d := range domains {
		add(d.Name)
	}

	r.Earned, r.Total = 0, 0
	for i, q := range r.Questions {
		r.Questions[i].Verdict = verdict(q.Earned, q.Total)
		r.Questions[i].WeightPct = 0
		// The index is hoisted because add may append to r.Domains, and Go
		// does not specify whether an index expression loads its slice
		// operand before or after a call in the index — &r.Domains[add(..)]
		// would be relying on the compiler to pick the safe one. Grade and
		// mcqgrade.Grade never reach the appending path (ex.Domains is
		// derived from these same questions), but Finalize is exported and
		// a caller assembling its own domain list can.
		di := add(q.Domain)
		d := &r.Domains[di]
		d.Earned += q.Earned
		d.Total += q.Total
		d.QuestionCount++
		r.Earned += q.Earned
		r.Total += q.Total
	}

	// A domain ex.Domains named but this attempt never drew contributes
	// no points and no weight; it is not part of what was graded, so it
	// must not appear in the rollup or dilute the weighting.
	kept := r.Domains[:0]
	for _, d := range r.Domains {
		if d.QuestionCount > 0 {
			kept = append(kept, d)
		}
	}
	r.Domains = kept
	if len(r.Domains) == 0 {
		r.Domains = nil
	}

	if r.Total > 0 {
		r.PointsPercent = r.Earned * 100 / r.Total
	} else {
		r.PointsPercent = 0
	}

	r.weight(declared)
	r.Passed = r.Percent >= r.PassingScore
}

// weight sets Percent and every WeightPct from the declared curriculum
// weights.
//
// The basis is all-or-nothing: unless every scorable domain in the
// attempt has a positive declared weight, the whole attempt falls back to
// weighting by points — which makes Percent identical to PointsPercent,
// the exact behaviour of every bank before weights were applied at all.
// Half-weighting an attempt from a partial spec.domainWeights would
// invent a curriculum the bank never published; a bank with no weights
// (smoke-01) is not a bank with weights of zero.
func (r *Results) weight(declared map[string]int) {
	r.Percent = 0

	// A domain with no scorable points (every check's "# points:" header
	// malformed) has no ratio to weight, so it stays out of both the
	// numerator and the denominator whichever basis is used.
	weights := make([]int, len(r.Domains))
	usePoints := false
	for i, d := range r.Domains {
		if d.Total == 0 {
			continue
		}
		if w := declared[d.Domain]; w > 0 {
			weights[i] = w
		} else {
			usePoints = true
			break
		}
	}
	if usePoints {
		for i, d := range r.Domains {
			weights[i] = d.Total
		}
	}

	totalWeight := 0
	for _, w := range weights {
		totalWeight += w
	}
	if totalWeight == 0 {
		return
	}

	// Exact rational arithmetic, not float64. Percent floors, and a
	// weighted score that is exactly the passing mark must not arrive
	// here as 65.99999999999999 and fail a candidate who passed.
	shares := make([]*big.Rat, len(r.Domains))
	score := new(big.Rat)
	for i, d := range r.Domains {
		if weights[i] == 0 {
			continue
		}
		shares[i] = big.NewRat(int64(weights[i])*100, int64(totalWeight))
		r.Domains[i].WeightPct, _ = shares[i].Float64()
		score.Add(score, new(big.Rat).Mul(shares[i], big.NewRat(int64(d.Earned), int64(d.Total))))
	}
	r.Percent = int(new(big.Int).Quo(score.Num(), score.Denom()).Int64())

	// A question's share is its domain's share, split across that
	// domain's questions in proportion to their points.
	index := make(map[string]int, len(r.Domains))
	for i, d := range r.Domains {
		index[d.Domain] = i
	}
	for j, q := range r.Questions {
		i, ok := index[q.Domain]
		if !ok || shares[i] == nil || q.Total == 0 {
			continue
		}
		qShare := new(big.Rat).Mul(shares[i], big.NewRat(int64(q.Total), int64(r.Domains[i].Total)))
		r.Questions[j].WeightPct, _ = qShare.Float64()
	}
}

// verdict maps a question's points onto the three states a result row
// renders. A question with no scorable points at all reads as failed
// rather than as a free "correct": a bank whose checks all have bad
// headers is broken, and the fresh-environment-scores-0 gate exists
// precisely because a score should never round in the candidate's favour
// by accident.
func verdict(earned, total int) string {
	switch {
	case total > 0 && earned >= total:
		return VerdictCorrect
	case earned > 0:
		return VerdictPartial
	default:
		return VerdictFailed
	}
}

// gradeCheck runs a single non-skipped check against r under a
// checkTimeout deadline and reports its CheckResult. Precedence when
// something goes wrong: a ctx deadline always reports "check timed out"
// (regardless of what r itself returned, since r may not distinguish its
// own cancellation-induced error from any other); otherwise a non-nil err
// reports err's text; otherwise ok determines pass/fail, with out
// (trimmed of trailing newlines, matching bash's $(...) command
// substitution) as the message either way.
//
// Artifacts exist only on that last path, and only when the check failed.
// The two error paths never touch out at all — a timed-out check's
// partial stdout is not evidence of anything, and neither is whatever a
// broken ssh happened to print.
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
		var artifacts []CheckArtifact
		cr.Message, artifacts = splitArtifacts(out)
		if ok {
			cr.Passed = true
			cr.Earned = c.Points
		} else {
			cr.Artifacts = artifacts
		}
	}
	return cr
}

// Scoreboard renders r in images/k8s-env/grade.sh's exact plain-text
// shape, including its final "RESULT <earned> <total> <pct>" line that
// tests/smoke.sh greps for.
//
// The percentage it prints is Percent, the weighted score — the same
// number the score page shows, and on a full hands-on bank the same
// number the raw points give, since tests/bank-weights.sh holds those
// points to the curriculum's ratios. One score, one line.
func (r *Results) Scoreboard() string {
	var b strings.Builder

	fmt.Fprintf(&b, "=== %s results ===\n", r.Bank)
	for _, q := range r.Questions {
		b.WriteString("\n")
		if q.Instance == "" {
			// mcq questions grade against the session, not an instance.
			fmt.Fprintf(&b, "-- %s\n", q.ID)
		} else {
			fmt.Fprintf(&b, "-- %s (on %s)\n", q.ID, q.Instance)
		}
		for _, c := range q.Checks {
			switch {
			case c.Skipped:
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
