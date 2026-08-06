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

type Runner interface {
	Run(ctx context.Context, instance, cmd string) (out string, ok bool, err error)
}

type sshRunner struct {
	keyPath string
}

func NewSSHRunner(keyPath string) Runner {
	return &sshRunner{keyPath: keyPath}
}

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

func remoteCommand(bank, qid, script string) string {
	return fmt.Sprintf("KUBECONFIG=/home/candidate/.kube/config BANK=%s bash /banks/%s/%s/validate.d/%s", bank, bank, qid, script)
}

type Results struct {
	Bank     string    `json:"bank"`
	GradedAt time.Time `json:"gradedAt"`
	Earned   int       `json:"earned"`
	Total    int       `json:"total"`

	Percent       int              `json:"percent"`
	PointsPercent int              `json:"pointsPercent"`
	PassingScore  int              `json:"passingScore"`
	Passed        bool             `json:"passed"`
	Questions     []QuestionResult `json:"questions"`

	Domains []DomainResult `json:"domains,omitempty"`

	Mode string `json:"mode,omitempty"`
	Seed string `json:"seed,omitempty"`

	DomainFilter []string `json:"domainFilter,omitempty"`

	DurationSeconds int `json:"durationSeconds,omitempty"`
	ElapsedSeconds  int `json:"elapsedSeconds,omitempty"`
}

type Attempt struct {
	Mode            string
	Seed            string
	DomainFilter    []string
	DurationSeconds int
	ElapsedSeconds  int

	TimeSpent map[string]int
}

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

type DomainResult struct {
	Domain string `json:"domain"`
	Earned int    `json:"earned"`
	Total  int    `json:"total"`

	WeightPct     float64 `json:"weightPct"`
	QuestionCount int     `json:"questionCount"`
}

type QuestionResult struct {
	ID       string        `json:"id"`
	Title    string        `json:"title,omitempty"`
	Instance string        `json:"instance"`
	Domain   string        `json:"domain"`
	Earned   int           `json:"earned"`
	Total    int           `json:"total"`
	Checks   []CheckResult `json:"checks"`

	WeightPct float64 `json:"weightPct"`

	Verdict string `json:"verdict"`

	TimeSpentSeconds int `json:"timeSpentSeconds,omitempty"`
	TargetSeconds    int `json:"targetSeconds,omitempty"`

	Selected []int    `json:"selected,omitempty"`
	Correct  []int    `json:"correct,omitempty"`
	Options  []string `json:"options,omitempty"`
	Multi    bool     `json:"multi,omitempty"`

	Solution string `json:"solution,omitempty"`
	Docs     []Doc  `json:"docs,omitempty"`
}

type Doc struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

type CheckResult struct {
	Name    string `json:"name"`
	Desc    string `json:"desc"`
	Points  int    `json:"points"`
	Earned  int    `json:"earned"`
	Passed  bool   `json:"passed"`
	Message string `json:"message"`

	Skipped bool `json:"skipped,omitempty"`

	Artifacts []CheckArtifact `json:"artifacts,omitempty"`
}

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

const (
	VerdictCorrect = "correct"
	VerdictPartial = "partial"
	VerdictFailed  = "failed"
)

func (r *Results) Finalize(domains []exam.Domain) {
	declared := make(map[string]int, len(domains))
	for _, d := range domains {
		declared[d.Name] = d.WeightPct
	}

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

		di := add(q.Domain)
		d := &r.Domains[di]
		d.Earned += q.Earned
		d.Total += q.Total
		d.QuestionCount++
		r.Earned += q.Earned
		r.Total += q.Total
	}

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

func (r *Results) weight(declared map[string]int) {
	r.Percent = 0

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

func gradeCheck(r Runner, bank string, q exam.Question, c exam.Check, checkTimeout time.Duration) CheckResult {
	ctx, cancel := context.WithTimeout(context.Background(), checkTimeout)
	defer cancel()

	out, ok, err := r.Run(ctx, q.Instance, remoteCommand(bank, q.ID, c.Name))

	cr := CheckResult{Name: c.Name, Desc: c.Desc, Points: c.Points}
	switch {

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

func (r *Results) Scoreboard() string {
	var b strings.Builder

	fmt.Fprintf(&b, "=== %s results ===\n", r.Bank)
	for _, q := range r.Questions {
		b.WriteString("\n")
		if q.Instance == "" {

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
