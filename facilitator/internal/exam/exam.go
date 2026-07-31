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

// The two exam types a bank may declare in spec.examType. An empty value
// normalizes to TypeHandsOn: v1alpha1 banks predate the field.
const (
	TypeHandsOn = "hands-on"
	TypeMCQ     = "mcq"
)

// Exam is a fully loaded exam: its metadata plus every question and the
// checks that grade it.
type Exam struct {
	Name              string
	Title             string
	// Type is spec.examType, normalized: TypeHandsOn or TypeMCQ. Any
	// other value is a load error — the conductor should never have made
	// such a bank active, and the facilitator must not guess.
	Type              string
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
// grade a candidate's solution to it (hands-on), or its options and
// answer key (mcq).
type Question struct {
	ID       string
	Instance string // hands-on only
	Domain   string
	Weight   int
	Checks   []Check // in lexical order of validate.d/*.sh; hands-on only
	// HintCount is how many tiers <qid>/hints.md declares. Only the count
	// is loaded at boot; the text is read per request, exactly as
	// question.md and solution.md already are — so editing a hint needs
	// no restart, and a bank with no hints is not an error.
	HintCount int

	// MCQ only. Correct holds strictly increasing indices into Options
	// and is never serialized to the client before grading.
	Options []string
	Correct []int
	Multi   bool // true = "select all that apply"
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
		ExamType          string `json:"examType"`
		Duration          string `json:"duration"`
		SpeedDuration     string `json:"speedDuration"`
		PassingScore      int    `json:"passingScore"`
		KubernetesVersion string `json:"kubernetesVersion"`
		Questions         []struct {
			ID       string   `json:"id"`
			Instance string   `json:"instance"`
			Domain   string   `json:"domain"`
			Weight   int      `json:"weight"`
			Options  []string `json:"options"`
			Correct  []int    `json:"correct"`
			Multi    bool     `json:"multi"`
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

	examType := doc.Spec.ExamType
	if examType == "" {
		examType = TypeHandsOn
	}
	if examType != TypeHandsOn && examType != TypeMCQ {
		return nil, fmt.Errorf("exam: unknown spec.examType %q", examType)
	}

	e := &Exam{
		Name:              doc.Metadata.Name,
		Title:             doc.Metadata.Title,
		Type:              examType,
		Duration:          dur,
		SpeedDuration:     speed,
		PassingScore:      doc.Spec.PassingScore,
		KubernetesVersion: doc.Spec.KubernetesVersion,
	}

	for _, q := range doc.Spec.Questions {
		question := Question{
			ID:        q.ID,
			Instance:  q.Instance,
			Domain:    q.Domain,
			Weight:    q.Weight,
			HintCount: countHints(bankDir, q.ID),
		}
		switch examType {
		case TypeMCQ:
			if err := validateMCQ(q.ID, q.Options, q.Correct, q.Multi); err != nil {
				return nil, err
			}
			question.Options = q.Options
			question.Correct = q.Correct
			question.Multi = q.Multi
			// The real exam scores uniformly; weight stays optional.
			if question.Weight == 0 {
				question.Weight = 1
			}
		default:
			checks, err := loadChecks(bankDir, q.ID)
			if err != nil {
				return nil, err
			}
			question.Checks = checks
		}
		e.Questions = append(e.Questions, question)
	}

	return e, nil
}

// validateMCQ enforces the answer-key shape documented in
// docs/bank-spec.md: 3-6 options; correct indices strictly increasing and
// in range; a single-answer question has exactly one, a multi-select at
// least two and fewer than all.
func validateMCQ(qid string, options []string, correct []int, multi bool) error {
	if len(options) < 3 || len(options) > 6 {
		return fmt.Errorf("exam: question %s must declare 3-6 options, has %d", qid, len(options))
	}
	if len(correct) == 0 {
		return fmt.Errorf("exam: question %s declares no correct indices", qid)
	}
	for i, c := range correct {
		if c < 0 || c >= len(options) {
			return fmt.Errorf("exam: question %s correct index %d is out of range for %d options", qid, c, len(options))
		}
		if i > 0 && c <= correct[i-1] {
			return fmt.Errorf("exam: question %s correct indices must be strictly increasing, got %v", qid, correct)
		}
	}
	if !multi && len(correct) != 1 {
		return fmt.Errorf("exam: single-answer question %s must declare exactly one correct index, has %d", qid, len(correct))
	}
	if multi && len(correct) < 2 {
		return fmt.Errorf("exam: multi-select question %s must declare at least two correct indices, has %d", qid, len(correct))
	}
	if multi && len(correct) >= len(options) {
		return fmt.Errorf("exam: multi-select question %s must declare fewer than all options as correct", qid)
	}
	return nil
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
