// Package exam loads an exam definition and its per-question validation
// checks from a question bank directory.
//
// Load reads the exam JSON emitted by `yq -o=json` from a bank's
// exam.yaml (see docs/bank-spec.md) and, for each question, the
// validate.d/*.sh scripts under the bank directory, parsing their
// "# points:" / "# desc:" header comments into Checks.
package exam

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Exam is a fully loaded exam: its metadata plus every question and the
// checks that grade it.
type Exam struct {
	Name              string
	Title             string
	Duration          time.Duration // parsed from spec.duration, e.g. "120m"
	// SpeedDuration is the compressed clock for a speed attempt. A bank
	// may set spec.speedDuration; otherwise it is half Duration, which is
	// the point of the mode — same questions, materially less time.
	SpeedDuration     time.Duration
	PassingScore      int
	KubernetesVersion string
	Questions         []Question // in exam.yaml order
}

// Question is a single exam question: its identity plus the checks that
// grade a candidate's solution to it.
type Question struct {
	ID       string
	Instance string
	Domain   string
	Weight   int
	Checks   []Check // in lexical order of validate.d/*.sh
	// HintCount is how many tiers <qid>/hints.md declares. Only the count
	// is loaded at boot; the text is read per request, exactly as
	// question.md and solution.md already are — so editing a hint needs
	// no restart, and a bank with no hints is not an error.
	HintCount int
}

// Check is one scoring criterion for a question, backed by a single
// validate.d/*.sh script.
type Check struct {
	Name   string // script basename, e.g. "10_ok.sh"
	Desc   string
	Points int
	Skip   bool // set when the script's "# points:" header is missing or malformed
}

// examDoc mirrors the JSON shape `yq -o=json` emits for a bank's
// exam.yaml. Only the fields Load needs are declared.
type examDoc struct {
	Metadata struct {
		Name  string `json:"name"`
		Title string `json:"title"`
	} `json:"metadata"`
	Spec struct {
		Duration          string `json:"duration"`
		SpeedDuration     string `json:"speedDuration"`
		PassingScore      int    `json:"passingScore"`
		KubernetesVersion string `json:"kubernetesVersion"`
		Questions         []struct {
			ID       string `json:"id"`
			Instance string `json:"instance"`
			Domain   string `json:"domain"`
			Weight   int    `json:"weight"`
		} `json:"questions"`
	} `json:"spec"`
}

// Load reads the exam JSON at examJSONPath and, for each question it
// declares, the question's validate.d/*.sh checks from
// bankDir/<qid>/validate.d/.
func Load(examJSONPath, bankDir string) (*Exam, error) {
	raw, err := os.ReadFile(examJSONPath)
	if err != nil {
		return nil, fmt.Errorf("exam: read %s: %w", examJSONPath, err)
	}

	var doc examDoc
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("exam: parse %s: %w", examJSONPath, err)
	}

	dur, err := time.ParseDuration(doc.Spec.Duration)
	if err != nil {
		return nil, fmt.Errorf("exam: parse spec.duration %q: %w", doc.Spec.Duration, err)
	}

	// Optional, and a malformed value is a bank bug worth failing on
	// rather than silently halving.
	speed := dur / 2
	if doc.Spec.SpeedDuration != "" {
		speed, err = time.ParseDuration(doc.Spec.SpeedDuration)
		if err != nil {
			return nil, fmt.Errorf("exam: parse spec.speedDuration %q: %w", doc.Spec.SpeedDuration, err)
		}
	}

	e := &Exam{
		Name:              doc.Metadata.Name,
		Title:             doc.Metadata.Title,
		Duration:          dur,
		SpeedDuration:     speed,
		PassingScore:      doc.Spec.PassingScore,
		KubernetesVersion: doc.Spec.KubernetesVersion,
	}

	for _, q := range doc.Spec.Questions {
		checks, err := loadChecks(bankDir, q.ID)
		if err != nil {
			return nil, err
		}
		e.Questions = append(e.Questions, Question{
			ID:        q.ID,
			Instance:  q.Instance,
			Domain:    q.Domain,
			Weight:    q.Weight,
			Checks:    checks,
			HintCount: countHints(bankDir, q.ID),
		})
	}

	return e, nil
}

// loadChecks reads bankDir/qid/validate.d/*.sh in lexical filename order
// and parses each script's header comments into a Check.
func loadChecks(bankDir, qid string) ([]Check, error) {
	pattern := filepath.Join(bankDir, qid, "validate.d", "*.sh")
	paths, err := filepath.Glob(pattern)
	if err != nil {
		return nil, fmt.Errorf("exam: glob %s: %w", pattern, err)
	}
	if len(paths) == 0 {
		return nil, fmt.Errorf("exam: question %s has no validate.d scripts in %s", qid, filepath.Join(bankDir, qid, "validate.d"))
	}
	// filepath.Glob's ordering isn't part of its documented contract, so
	// sort explicitly to guarantee lexical order.
	sort.Strings(paths)

	checks := make([]Check, 0, len(paths))
	for _, p := range paths {
		c, err := loadCheck(p)
		if err != nil {
			return nil, err
		}
		checks = append(checks, c)
	}
	return checks, nil
}

// Header comment prefixes parsed from validate.d scripts, matching
// images/k8s-env/grade.sh.
const (
	pointsPrefix = "# points: "
	descPrefix   = "# desc: "
)

// loadCheck parses one validate.d script's "# points:" / "# desc:" header
// comments into a Check. As in grade.sh, the first line matching each
// prefix wins.
func loadCheck(path string) (Check, error) {
	f, err := os.Open(path)
	if err != nil {
		return Check{}, fmt.Errorf("exam: open %s: %w", path, err)
	}
	defer f.Close()

	var pointsRaw, desc string
	havePoints, haveDesc := false, false

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Text()
		if !havePoints && strings.HasPrefix(line, pointsPrefix) {
			pointsRaw = strings.TrimPrefix(line, pointsPrefix)
			havePoints = true
		}
		if !haveDesc && strings.HasPrefix(line, descPrefix) {
			desc = strings.TrimPrefix(line, descPrefix)
			haveDesc = true
		}
		if havePoints && haveDesc {
			break
		}
	}
	if err := sc.Err(); err != nil {
		return Check{}, fmt.Errorf("exam: read %s: %w", path, err)
	}

	points, skip := parsePoints(pointsRaw, havePoints)
	return Check{
		Name:   filepath.Base(path),
		Desc:   desc,
		Points: points,
		Skip:   skip,
	}, nil
}

// parsePoints validates a "# points:" header value. A missing header, a
// non-integer value, a negative value, or a zero-padded value like "08"
// (which grade.sh's bash arithmetic mishandles as octal) is skipped with
// Points=0.
func parsePoints(raw string, present bool) (points int, skip bool) {
	if !present {
		return 0, true
	}
	if raw != "0" && strings.HasPrefix(raw, "0") {
		return 0, true
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		return 0, true
	}
	return n, false
}

// hintHeading matches a tier heading in a question's hints.md.
//
// One file with "## Hint N" headings, not one file per tier: every other
// per-question artifact is a single file per concern (question.md,
// solution.md), an author writes both tiers in one sitting, and two files
// across 22 questions is 44 files to keep in step for a structure that
// will never grow past a handful of tiers.
var hintHeading = regexp.MustCompile(`(?m)^##\s+Hint\s+\d+\s*$`)

// HintsPath is where a question's hints live.
func HintsPath(bankDir, qid string) string {
	return filepath.Join(bankDir, qid, "hints.md")
}

// countHints returns how many tiers a question declares, or 0 when it
// has no hints.md. A missing file is the normal case for a bank that has
// not been given hints, and must never be an error.
func countHints(bankDir, qid string) int {
	raw, err := os.ReadFile(HintsPath(bankDir, qid))
	if err != nil {
		return 0
	}
	return len(hintHeading.FindAllIndex(raw, -1))
}

// SplitHints returns the tier bodies of a hints.md, in order. Text before
// the first heading is ignored, so an author can leave a note at the top.
func SplitHints(raw []byte) []string {
	locs := hintHeading.FindAllIndex(raw, -1)
	out := make([]string, 0, len(locs))
	for i, loc := range locs {
		end := len(raw)
		if i+1 < len(locs) {
			end = locs[i+1][0]
		}
		body := strings.TrimSpace(string(raw[loc[1]:end]))
		out = append(out, body)
	}
	return out
}
