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
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
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
	Name  string
	Title string
	// Certification is metadata.certification, e.g. "CKAD" — the exam
	// this bank rehearses, as opposed to Title, which names the bank
	// ("CKAD Mock Exam 01"). Optional: a bank need not claim one, and a
	// UI that has none falls back to the title.
	Certification string
	// Type is spec.examType, normalized: TypeHandsOn or TypeMCQ. Any
	// other value is a load error — the conductor should never have made
	// such a bank active, and the facilitator must not guess.
	Type     string
	Duration time.Duration // parsed from spec.duration, e.g. "120m"
	// SpeedDuration is the compressed clock for a speed attempt. A bank
	// may set spec.speedDuration; otherwise it is half Duration, which is
	// the point of the mode — same questions, materially less time.
	SpeedDuration     time.Duration
	PassingScore      int
	KubernetesVersion string
	Questions         []Question // in exam.yaml order

	// DomainWeights is spec.domainWeights: each curriculum domain's
	// published percentage share. Historically read by no Go code (only
	// tests/bank-mcq.sh, a build gate) — Draw is what made it a
	// runtime value, since a pooled draw needs it to know each domain's
	// target question count, and the graders now weight the final score
	// by it.
	DomainWeights map[string]int
	// Domains is DomainWeights resolved against the questions that
	// actually exist: one entry per domain the questions use, in bank
	// order, carrying that domain's declared weight (0 when the bank
	// declares none). It is the map turned into the thing scoring needs —
	// an ordered list — so no consumer has to re-derive the order from
	// Questions, and none of them can accidentally range over a Go map.
	Domains []Domain
	// ExamLength is spec.examLength: how many questions a pooled attempt
	// draws from Questions. Zero (or >= len(Questions)) means no pooling —
	// Draw returns every question, in bank order, exactly as every bank
	// behaved before this field existed.
	//
	// Read by both engines. It began mcq-only because a hands-on cluster
	// was seeded with the whole bank at boot, which made a subset draw a
	// pure loss; a hands-on bank that declares this now opts its boot out
	// of that loop instead and has the drawn subset seeded at the start of
	// the attempt. See Draw and images/k8s-env/bootstrap.sh.
	ExamLength int
}

// Pooled reports whether ex draws a strict subset of its questions —
// spec.examLength set, and smaller than the pool behind it.
//
// The one definition of "this bank pools", because every consumer of the
// answer does something different with it and they must not disagree:
// Draw stratifies, the exam and catalog responses advertise ExamLength
// instead of the pool size, and the start handler seeds the drawn subset
// before the clock runs rather than trusting boot to have done it.
func Pooled(ex *Exam) bool {
	return ex.ExamLength > 0 && ex.ExamLength < len(ex.Questions)
}

// Domain is one curriculum domain of a bank: its name and the percentage
// share spec.domainWeights publishes for it. WeightPct is 0 for a bank
// with no spec.domainWeights at all (smoke-01, the hidden switch-test
// fixture) — the graders read that as "this bank has no curriculum to
// weight against" and fall back to weighting by points.
type Domain struct {
	Name      string
	WeightPct int
}

// Question is a single exam question: its identity plus the checks that
// grade a candidate's solution to it (hands-on), or its options and
// answer key (mcq).
type Question struct {
	ID       string
	Title    string // optional short label; empty means the UI falls back to the id
	Instance string // hands-on only
	Domain   string
	Weight   int
	Checks   []Check // in lexical order of validate.d/*.sh; hands-on only
	// HintCount is how many tiers <qid>/hints.md declares. Only the count
	// is loaded at boot; the text is read per request, exactly as
	// question.md and solution.md already are — so editing a hint needs
	// no restart, and a bank with no hints is not an error.
	HintCount int
	// TargetSeconds is spec.questions[].targetSeconds: how long this
	// question is meant to take. Optional, and zero means "not authored"
	// — TargetSeconds(ex, q) then derives one from the question's share of
	// the exam clock. It is a pacing budget, never a limit: nothing
	// enforces it and running over costs no points.
	TargetSeconds int
	// Docs is spec.questions[].docs: upstream reading for this question's
	// subject. Optional, usually absent, and served only with the
	// solution — the deep dive a candidate reads after the attempt, in
	// their own browser. Never with the question: the exam desktop
	// browses through an allowlist proxy and a link out of the exam is
	// not something an exam offers.
	Docs []Doc

	// MCQ only. Correct holds strictly increasing indices into Options
	// and is never serialized to the client before grading.
	Options []string
	Correct []int
	Multi   bool // true = "select all that apply"
}

// Doc is one upstream documentation link: the concept it names, and the
// page that explains it.
//
// Label is the concept ("Ingress path types"), never the URL. A link
// list is read as a list of things to go and learn, and a column of
// bare kubernetes.io paths is neither readable nor honest about which
// of them is the one worth opening.
type Doc struct {
	Label string
	URL   string
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
		Name          string `json:"name"`
		Title         string `json:"title"`
		Certification string `json:"certification"`
	} `json:"metadata"`
	Spec struct {
		ExamType          string         `json:"examType"`
		Duration          string         `json:"duration"`
		SpeedDuration     string         `json:"speedDuration"`
		PassingScore      int            `json:"passingScore"`
		KubernetesVersion string         `json:"kubernetesVersion"`
		DomainWeights     map[string]int `json:"domainWeights"`
		ExamLength        int            `json:"examLength"`
		Questions         []struct {
			ID            string   `json:"id"`
			Title         string   `json:"title"`
			Instance      string   `json:"instance"`
			Domain        string   `json:"domain"`
			Weight        int      `json:"weight"`
			TargetSeconds int      `json:"targetSeconds"`
			Options       []string `json:"options"`
			Correct       []int    `json:"correct"`
			Multi         bool          `json:"multi"`
			Docs          []examDocLink `json:"docs"`
		} `json:"questions"`
	} `json:"spec"`
}

// examDocLink mirrors one spec.questions[].docs entry.
type examDocLink struct {
	Label string `json:"label"`
	URL   string `json:"url"`
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
		Certification:     doc.Metadata.Certification,
		Type:              examType,
		Duration:          dur,
		SpeedDuration:     speed,
		PassingScore:      doc.Spec.PassingScore,
		KubernetesVersion: doc.Spec.KubernetesVersion,
		DomainWeights:     doc.Spec.DomainWeights,
		ExamLength:        doc.Spec.ExamLength,
	}

	for _, q := range doc.Spec.Questions {
		if q.TargetSeconds < 0 {
			return nil, fmt.Errorf("exam: question %s declares a negative targetSeconds %d", q.ID, q.TargetSeconds)
		}
		question := Question{
			ID:            q.ID,
			Title:         q.Title,
			Instance:      q.Instance,
			Domain:        q.Domain,
			Weight:        q.Weight,
			TargetSeconds: q.TargetSeconds,
			HintCount:     countHints(bankDir, q.ID),
			Docs:          loadDocs(q.ID, q.Docs),
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

	// Checked for both engines, not just mcq: a hands-on bank can pool
	// too, and a declared length its pool cannot satisfy is an authoring
	// bug the offline gates should catch — never a runtime surprise a
	// candidate discovers when Draw refuses to produce their exam.
	// A negative length was previously ignored (it fails Draw's `length
	// <= 0` test and silently means "no pooling"); it is now the same
	// authoring bug said louder, because nobody types -5 on purpose.
	if e.ExamLength < 0 {
		return nil, fmt.Errorf("exam: spec.examLength %d is negative", e.ExamLength)
	}
	if e.ExamLength > len(e.Questions) {
		return nil, fmt.Errorf("exam: spec.examLength %d exceeds the pool of %d questions", e.ExamLength, len(e.Questions))
	}

	// Domains follows the questions, not spec.domainWeights: a weight for
	// a domain no question uses would weight nothing, and tests/
	// bank-weights.sh already fails a bank that declares one.
	for _, name := range domainOrder(e.Questions) {
		e.Domains = append(e.Domains, Domain{Name: name, WeightPct: e.DomainWeights[name]})
	}

	return e, nil
}

// domainOrder returns each distinct question domain once, in the order
// the domain first appears in questions.
//
// First appearance, never sorted and never map order: it is the order the
// bank author wrote the curriculum in (Fundamentals, Orchestration, ...),
// and both a pooled draw's question order and a score page's domain
// rollup read better in it than in an alphabet.
func domainOrder(questions []Question) []string {
	var order []string
	seen := map[string]bool{}
	for _, q := range questions {
		if !seen[q.Domain] {
			seen[q.Domain] = true
			order = append(order, q.Domain)
		}
	}
	return order
}

// Subset returns the questions ids names, in ids' order, skipping any id
// ex does not declare. Empty ids means "no subset was drawn" and returns
// every question in bank order — which is what an unpooled bank of
// either engine, and the pre-pooling behaviour of both, rely on.
//
// This is what scopes grading to the attempt: the session records the
// drawn ids, and every grader routes its question list through here so a
// pool question the candidate never saw cannot land in the score.
func Subset(ex *Exam, ids []string) []Question {
	if len(ids) == 0 {
		return ex.Questions
	}
	byID := make(map[string]Question, len(ex.Questions))
	for _, q := range ex.Questions {
		byID[q.ID] = q
	}
	out := make([]Question, 0, len(ids))
	for _, id := range ids {
		if q, ok := byID[id]; ok {
			out = append(out, q)
		}
	}
	return out
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

// loadDocs validates a question's declared documentation links, keeping
// the ones that are usable and dropping the rest.
//
// A bad entry is DROPPED, never fatal, and that asymmetry is the whole
// point of this function. Every other load error in this package refuses
// the bank, because every other one is about the exam: a question with
// no checks cannot be scored, an out-of-range answer key grades a
// candidate wrongly. A docs link is a study aid read after the attempt
// is over, so the worst a typo can do is leave a reader one link short —
// while failing the boot over it would stop a candidate sitting the exam
// at all. The dropped entry is logged so the author finds out.
//
// "Usable" is a link a browser can be handed: an https URL that parses
// and names a host, under a label that says what it is. http is refused
// rather than upgraded — the pages worth linking all serve https, and
// quietly rewriting an author's URL is how a link ends up pointing
// somewhere they never checked.
func loadDocs(qid string, declared []examDocLink) []Doc {
	if len(declared) == 0 {
		return nil
	}
	out := make([]Doc, 0, len(declared))
	for _, d := range declared {
		label := strings.TrimSpace(d.Label)
		raw := strings.TrimSpace(d.URL)
		if err := validateDocLink(label, raw); err != nil {
			fmt.Fprintf(os.Stderr, "exam: question %s: dropping docs link %q: %v\n", qid, raw, err)
			continue
		}
		out = append(out, Doc{Label: label, URL: raw})
	}
	if len(out) == 0 {
		// Nil, not an empty slice: "this question declared nothing usable"
		// and "this question declared nothing" reach the client as the same
		// absent field, and every consumer already handles the second.
		return nil
	}
	return out
}

// validateDocLink states what a usable documentation link is. See
// loadDocs for why a failure here is not a load error.
func validateDocLink(label, raw string) error {
	if label == "" {
		return errors.New("no label")
	}
	if raw == "" {
		return errors.New("no url")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return err
	}
	if u.Scheme != "https" {
		return fmt.Errorf("scheme %q is not https", u.Scheme)
	}
	if u.Host == "" {
		return errors.New("no host")
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

// DrawOptions configures one draw. The zero value draws the whole
// curriculum at the bank's own declared length under a freshly minted
// seed, which is what every caller with nothing to configure wants.
type DrawOptions struct {
	// Seed replays a previous draw: six lowercase hex digits. Empty mints
	// a fresh one — every attempt has a seed, so every attempt is
	// replayable without the candidate having had to ask in advance. A
	// malformed value is an error, never a silent reseed.
	Seed string
	// Domains narrows the draw to these curriculum domains. Empty means
	// the whole curriculum. A name the bank does not have is an error
	// (wrapped in ErrDrawRequest), not a silent empty draw.
	Domains []string
	// Length overrides ex.ExamLength for this draw. Zero means "the
	// bank's own", which is what every caller in the tree passes; the
	// override exists for tests.
	//
	// It does NOT make a hands-on bank pooled. Whether a cluster was
	// seeded at boot is decided by the BANK (Pooled, read identically by
	// images/k8s-env/bootstrap.sh and by the start handler), so overriding
	// the length here on an unpooled hands-on bank would draw a subset out
	// of a cluster that holds every question — harmless, but not an
	// attempt anyone should ship.
	Length int
}

// DrawResult is one attempt's drawn question set plus everything needed
// to replay it: the seed it came out of and the fingerprint of the pool
// it ran against. A seed only reproduces a draw within one pool, so the
// two travel together.
type DrawResult struct {
	// IDs is the drawn subset in the order the attempt presents it.
	IDs []string
	// Seed is the six-hex-digit seed actually used, minted when the
	// caller supplied none.
	Seed string
	// Domains is the normalized domain filter in bank order, nil when the
	// draw covered the whole curriculum.
	Domains []string
	// PoolDigest fingerprints the pool this draw ran against.
	PoolDigest string
}

// ErrDrawRequest wraps every Draw failure caused by the caller's
// options — a malformed seed, a domain the bank does not have — as
// opposed to one caused by the bank's own shape (a domain whose pool is
// too shallow for its target, which is an authoring bug the offline
// gates should have caught). The HTTP layer maps the first to 400 and
// the second to 500, and the distinction has to be made here because
// only here is it known.
var ErrDrawRequest = errors.New("exam: invalid draw request")

// seedPattern is the seed's exact accepted shape. Six lowercase hex
// digits: short enough to read down a phone, type from a screenshot and
// say out loud, and 16.7M draws is far more than one candidate will
// distinguish between.
var seedPattern = regexp.MustCompile(`^[0-9a-f]{6}$`)

// Draw returns the questions for one attempt: a domain-stratified subset
// sized to the exam's declared length when the bank has opted into
// pooling (Pooled — ExamLength set and smaller than the pool), or every
// in-scope question in bank order otherwise. Every bank in the repo
// except kcna-mock takes the second path, so pooling stays additive and
// never a default a bank falls into.
//
// Pooling used to be refused outright for hands-on banks, and the reason
// was never about drawing: a hands-on cluster was seeded with every
// question in the bank at boot, so a subset draw bought nothing and cost
// the candidate the questions it left out. A hands-on bank that declares
// spec.examLength now opts its BOOT out of that loop
// (images/k8s-env/bootstrap.sh) and has the drawn subset seeded when the
// attempt starts. Nothing about the arithmetic below changed.
//
// Each domain contributes a fixed target count (domainTargets' largest-
// remainder rounding of ex.DomainWeights against the draw length) rather
// than letting the draw land wherever chance puts it: a candidate's set
// of questions must match the curriculum's published weights every time,
// not just on average, which an unstratified sample cannot promise.
//
// The randomness is a keyed SHA-256 counter stream (see drawStream), so
// the same seed against the same pool yields the same draw on any build
// of any Go version. math/rand would have been the obvious choice and is
// the wrong one — how much of its stream a shuffle consumes is not a
// stability guarantee across releases — and crypto/rand, which this
// package used before seeding existed, cannot be seeded at all.
func Draw(ex *Exam, opts DrawOptions) (DrawResult, error) {
	seed, err := resolveSeed(opts.Seed)
	if err != nil {
		return DrawResult{}, err
	}

	// Domain order comes from first appearance in Questions, not from
	// DomainWeights (a map, so unordered) — this is what keeps the drawn
	// exam flowing through the curriculum in the same order the bank was
	// authored in (Fundamentals, Orchestration, ...), with only the
	// identity and order WITHIN a domain randomized. It is read from the
	// questions here rather than from ex.Domains so a hand-built Exam
	// that never went through Load still draws.
	filter, err := resolveDomains(opts.Domains, domainOrder(ex.Questions))
	if err != nil {
		return DrawResult{}, err
	}

	res := DrawResult{Seed: seed, Domains: filter, PoolDigest: PoolDigest(ex)}

	// The filter applies to BOTH engines. On an unpooled hands-on bank
	// narrowing is free: bootstrap.sh seeds every question in the bank
	// into the cluster at boot whatever the draw is, so the cluster state
	// a filtered attempt sees is identical. On a pooled one it is not
	// free — nothing is seeded at boot — but it is still correct, because
	// the caller seeds exactly the ids this returns before the attempt's
	// clock starts.
	inScope := ex.Questions
	if len(filter) > 0 {
		keep := make(map[string]bool, len(filter))
		for _, d := range filter {
			keep[d] = true
		}
		inScope = nil
		for _, q := range ex.Questions {
			if keep[q.Domain] {
				inScope = append(inScope, q)
			}
		}
	}

	length := opts.Length
	if length <= 0 {
		length = ex.ExamLength
	}
	if length <= 0 || length >= len(inScope) {
		res.IDs = questionIDs(inScope)
		return res, nil
	}

	order := domainOrder(inScope)
	poolByDomain := map[string][]string{}
	for _, q := range inScope {
		poolByDomain[q.Domain] = append(poolByDomain[q.Domain], q.ID)
	}

	targets, err := domainTargets(ex.DomainWeights, order, length)
	if err != nil {
		return DrawResult{}, err
	}

	drawn := make([]string, 0, length)
	for _, d := range order {
		k := targets[d]
		pool := poolByDomain[d]
		if k > len(pool) {
			return DrawResult{}, fmt.Errorf("exam: domain %q needs %d questions for a %d-question draw, pool has only %d", d, k, length, len(pool))
		}
		// The stream is keyed per domain, so a domain's questions shuffle
		// the same way whether or not the filter kept its neighbours —
		// which makes a filtered draw a genuine sub-draw of the full one
		// rather than an unrelated sample that happens to share a seed.
		drawn = append(drawn, shuffle(pool, seed, d)[:k]...)
	}
	res.IDs = drawn
	return res, nil
}

// questionIDs projects questions onto their ids, in order.
func questionIDs(questions []Question) []string {
	out := make([]string, len(questions))
	for i, q := range questions {
		out[i] = q.ID
	}
	return out
}

// resolveSeed validates a caller-supplied seed or mints a fresh one.
func resolveSeed(seed string) (string, error) {
	if seed == "" {
		return mintSeed()
	}
	if !seedPattern.MatchString(seed) {
		return "", fmt.Errorf("%w: seed %q must be six lowercase hex digits", ErrDrawRequest, seed)
	}
	return seed, nil
}

// mintSeed returns a fresh six-hex-digit seed from crypto/rand. The
// randomness that CHOOSES a seed is unseeded on purpose; only the draw
// the seed then drives has to be reproducible.
func mintSeed() (string, error) {
	var b [3]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", fmt.Errorf("exam: mint seed: %w", err)
	}
	return hex.EncodeToString(b[:]), nil
}

// resolveDomains validates a requested domain filter against the domains
// the bank actually has and returns it deduplicated, in bank order. An
// empty (or all-empty) request returns nil: the whole curriculum, which
// is the only kind of attempt a "passed" claim can rest on.
func resolveDomains(want, have []string) ([]string, error) {
	known := make(map[string]bool, len(have))
	for _, d := range have {
		known[d] = true
	}
	requested := make(map[string]bool, len(want))
	for _, d := range want {
		if d == "" {
			continue
		}
		if !known[d] {
			return nil, fmt.Errorf("%w: this bank has no domain %q", ErrDrawRequest, d)
		}
		requested[d] = true
	}
	if len(requested) == 0 || len(requested) == len(have) {
		// Naming every domain is the whole curriculum said the long way;
		// recording it as a filter would make a full-coverage attempt look
		// narrowed for the rest of its life.
		return nil, nil
	}
	var out []string
	for _, d := range have {
		if requested[d] {
			out = append(out, d)
		}
	}
	return out, nil
}

// PoolDigest fingerprints the set of questions a draw can choose from:
// every question's id and domain, in bank order.
//
// A seed alone does not identify a draw — edit the bank and the same
// seed yields a different set — so this travels beside it. It is
// deliberately blind to everything a draw does not depend on: rewording
// a question.md, fixing a typo in an option, or adding a hint tier
// leaves the digest alone, because none of them changes which questions
// exist or which domain they belong to. Adding, removing, renaming or
// re-domaining a question changes it, because every one of those changes
// what a draw would produce.
func PoolDigest(ex *Exam) string {
	h := sha256.New()
	for _, q := range ex.Questions {
		io.WriteString(h, q.ID)
		h.Write([]byte{0})
		io.WriteString(h, q.Domain)
		h.Write([]byte{0})
	}
	// Six bytes. This is a change detector between two banks a candidate
	// might plausibly hold, not a defence against someone constructing a
	// collision on purpose — and twelve characters still fit on a card
	// next to the seed.
	return hex.EncodeToString(h.Sum(nil)[:6])
}

// ErrPoolChanged reports that a persisted draw no longer describes the
// loaded bank.
var ErrPoolChanged = errors.New("exam: the question bank changed after this attempt was drawn")

// CheckPool refuses when digest does not fingerprint ex's current pool.
//
// This is the guard on Subset's deliberate tolerance: Subset silently
// skips ids the exam does not declare, so a session whose drawn ids
// outlived the bank they came from would be graded on the intersection
// and reported with a confident, wrong Total — a candidate would see a
// plausible score for an exam they did not sit. Grading must fail loudly
// instead. An empty digest is an attempt started before digests existed
// and is not second-guessed.
func CheckPool(ex *Exam, digest string) error {
	if digest == "" {
		return nil
	}
	if got := PoolDigest(ex); got != digest {
		return fmt.Errorf("%w: it was drawn from pool %s, the loaded bank is %s", ErrPoolChanged, digest, got)
	}
	return nil
}

// TargetSeconds returns how long q is meant to take, and whether that
// figure was DERIVED rather than authored in the bank.
//
// Derivation is the question's weight's share of the exam clock, so both
// shipped banks need no edits at all. The caller is told which it got
// because they are different kinds of claim: an authored target is the
// author's judgement of the work, a derived one is arithmetic about
// weights, and a UI that presents the second as the first is lying
// quietly.
//
// The divisor is the weight ONE ATTEMPT carries, not the pool's: a
// pooled bank's 97 authored questions are not what the 90-minute clock
// is spread across, its 65-question draw is. The clock is the bank's
// declared spec.duration, never the attempt's, so an untimed training
// attempt — which has no clock to divide — still shows the same pacing
// budget as the exam it is practice for.
func TargetSeconds(ex *Exam, q Question) (seconds int, derived bool) {
	if q.TargetSeconds > 0 {
		return q.TargetSeconds, false
	}
	basis := attemptWeight(ex)
	if basis <= 0 || q.Weight <= 0 || ex.Duration <= 0 {
		return 0, false
	}
	return int(float64(q.Weight)*ex.Duration.Seconds()/basis + 0.5), true
}

// attemptWeight is the total question weight one attempt carries: the
// bank's whole weight for an unpooled exam, and its mean weight times
// the draw length for a pooled one.
func attemptWeight(ex *Exam) float64 {
	n := len(ex.Questions)
	if n == 0 {
		return 0
	}
	total := 0
	for _, q := range ex.Questions {
		total += q.Weight
	}
	draw := n
	if Pooled(ex) {
		draw = ex.ExamLength
	}
	return float64(total) * float64(draw) / float64(n)
}

// domainTargets distributes n across the domains in order, in the ratios
// domainWeights declares, by largest-remainder rounding: each domain
// first takes floor(weight*n/total), then the few leftover slots (n
// minus that sum, always smaller than len(order)) go to the domains with
// the largest fractional remainder, ties breaking toward whichever
// domain appears earlier in order — so the same bank always targets the
// same counts; only the shuffle within a domain varies between attempts.
//
// The denominator is the weights of the domains in ORDER, not a
// hardcoded 100. For a whole-curriculum draw those are the same number
// (the offline gates hold every bank's weights to 100). For a filtered
// one they are not, and renormalizing is what lets a two-domain attempt
// still divide in the ratio the curriculum publishes for those two.
func domainTargets(domainWeights map[string]int, order []string, n int) (map[string]int, error) {
	if len(domainWeights) == 0 {
		return nil, fmt.Errorf("exam: spec.domainWeights is required to draw a %d-question subset", n)
	}

	type remainder struct {
		domain string
		frac   float64
		index  int
	}

	totalWeight := 0
	for _, d := range order {
		w, ok := domainWeights[d]
		if !ok {
			return nil, fmt.Errorf("exam: domain %q has questions but no spec.domainWeights entry", d)
		}
		totalWeight += w
	}
	if totalWeight <= 0 {
		return nil, fmt.Errorf("exam: the domains of a %d-question draw declare no weight between them", n)
	}

	targets := make(map[string]int, len(order))
	remainders := make([]remainder, 0, len(order))
	assigned := 0
	for i, d := range order {
		raw := float64(domainWeights[d]) * float64(n) / float64(totalWeight)
		floor := int(raw)
		targets[d] = floor
		assigned += floor
		remainders = append(remainders, remainder{domain: d, frac: raw - float64(floor), index: i})
	}

	leftover := n - assigned
	if leftover < 0 || leftover > len(order) {
		return nil, fmt.Errorf("exam: domainWeights do not add up cleanly for a %d-question draw", n)
	}

	sort.Slice(remainders, func(i, j int) bool {
		if remainders[i].frac != remainders[j].frac {
			return remainders[i].frac > remainders[j].frac
		}
		return remainders[i].index < remainders[j].index
	})
	for i := 0; i < leftover; i++ {
		targets[remainders[i].domain]++
	}
	return targets, nil
}

// shuffle returns a copy of ids in the order the (seed, label) pair
// determines — a Fisher-Yates shuffle driven by drawStream. ids itself is
// never mutated, and the same pair always produces the same order.
func shuffle(ids []string, seed, label string) []string {
	out := make([]string, len(ids))
	copy(out, ids)
	s := newDrawStream(seed, label)
	for i := len(out) - 1; i > 0; i-- {
		j := s.intn(i + 1)
		out[i], out[j] = out[j], out[i]
	}
	return out
}

// drawStream is the draw's randomness: SHA-256 over (seed, label,
// counter), the counter incrementing, blocks concatenated into an
// endless byte stream.
//
// Hand-rolled rather than math/rand, and the reason is reproducibility
// across builds, not secrecy. math/rand's OUTPUT for a given seed is
// stable, but how many values a shuffle draws from it is an
// implementation detail of the standard library, so a future Go release
// may legitimately renumber every draw a candidate has saved. SHA-256 of
// a counter is fixed by the hash, and nothing about it can drift.
type drawStream struct {
	key     []byte
	counter uint64
	block   [sha256.Size]byte
	used    int
}

func newDrawStream(seed, label string) *drawStream {
	// NUL-separated so ("ab", "c") and ("a", "bc") cannot key the same
	// stream — the label is a domain name and is entirely arbitrary text.
	key := make([]byte, 0, len(seed)+len(label)+2)
	key = append(key, seed...)
	key = append(key, 0)
	key = append(key, label...)
	key = append(key, 0)
	// used == len(block) forces the first read to generate a block.
	return &drawStream{key: key, used: sha256.Size}
}

// next32 returns the stream's next four bytes as a uint32.
func (s *drawStream) next32() uint32 {
	if s.used+4 > sha256.Size {
		var ctr [8]byte
		binary.BigEndian.PutUint64(ctr[:], s.counter)
		s.counter++
		h := sha256.New()
		h.Write(s.key)
		h.Write(ctr[:])
		h.Sum(s.block[:0])
		s.used = 0
	}
	v := binary.BigEndian.Uint32(s.block[s.used : s.used+4])
	s.used += 4
	return v
}

// intn returns a uniform value in [0, n) by rejection sampling. Taking
// the modulus directly would bias the low values, which for a 5-of-9
// draw is a visible thumb on which questions a candidate gets.
func (s *drawStream) intn(n int) int {
	if n <= 1 {
		return 0
	}
	un := uint64(n)
	limit := uint64(1) << 32
	limit -= limit % un
	for {
		if v := uint64(s.next32()); v < limit {
			return int(v % un)
		}
	}
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
