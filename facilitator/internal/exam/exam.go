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

const (
	TypeHandsOn = "hands-on"
	TypeMCQ     = "mcq"
)

const (
	TierQuick = "quick"
	TierCore  = "core"
	TierDeep  = "deep"
)

var tierOrder = []string{TierQuick, TierCore, TierDeep}

// A tier is the time band, not a judgement: the gate checks the label
// against targetSeconds so it cannot drift into an opinion.
var tierBounds = map[string][2]int{
	TierQuick: {1, 240},
	TierCore:  {241, 540},
	TierDeep:  {541, 840},
}

type Exam struct {
	Name  string
	Title string

	Certification string

	Type     string
	Duration time.Duration

	SpeedDuration     time.Duration
	PassingScore      int
	KubernetesVersion string

	Environment Environment
	Questions   []Question

	DomainWeights map[string]int

	DifficultyMix map[string]int

	Domains []Domain

	ExamLength int

	HasTips bool
}

func Pooled(ex *Exam) bool {
	return ex.ExamLength > 0 && ex.ExamLength < len(ex.Questions)
}

type Environment struct {
	Provider string
	Nodes    int
}

type Domain struct {
	Name      string
	WeightPct int
}

type Question struct {
	ID       string
	Title    string
	Instance string
	Domain   string
	Weight   int
	Checks   []Check

	HintCount int

	TargetSeconds int

	Difficulty string

	Docs []Doc

	Options []string
	Correct []int
	Multi   bool
}

type Doc struct {
	Label string
	URL   string
}

type Check struct {
	Name   string
	Desc   string
	Points int
	Skip   bool
}

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
		DifficultyMix     map[string]int `json:"difficultyMix"`
		ExamLength        int            `json:"examLength"`
		Environment       struct {
			Provider string `json:"provider"`
			Nodes    int    `json:"nodes"`
		} `json:"environment"`
		Questions []struct {
			ID            string        `json:"id"`
			Title         string        `json:"title"`
			Instance      string        `json:"instance"`
			Domain        string        `json:"domain"`
			Weight        int           `json:"weight"`
			TargetSeconds int           `json:"targetSeconds"`
			Difficulty    string        `json:"difficulty"`
			Options       []string      `json:"options"`
			Correct       []int         `json:"correct"`
			Multi         bool          `json:"multi"`
			Docs          []examDocLink `json:"docs"`
		} `json:"questions"`
	} `json:"spec"`
}

type examDocLink struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

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
		DifficultyMix:     doc.Spec.DifficultyMix,
		ExamLength:        doc.Spec.ExamLength,
		Environment: Environment{
			Provider: doc.Spec.Environment.Provider,
			Nodes:    doc.Spec.Environment.Nodes,
		},
		HasTips: hasTips(bankDir),
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
			Difficulty:    q.Difficulty,
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

	if e.ExamLength < 0 {
		return nil, fmt.Errorf("exam: spec.examLength %d is negative", e.ExamLength)
	}
	if e.ExamLength > len(e.Questions) {
		return nil, fmt.Errorf("exam: spec.examLength %d exceeds the pool of %d questions", e.ExamLength, len(e.Questions))
	}

	if err := validateDifficulty(e); err != nil {
		return nil, err
	}

	for _, name := range domainOrder(e.Questions) {
		e.Domains = append(e.Domains, Domain{Name: name, WeightPct: e.DomainWeights[name]})
	}

	return e, nil
}

func validateDifficulty(e *Exam) error {
	if len(e.DifficultyMix) == 0 {
		for _, q := range e.Questions {
			if q.Difficulty != "" {
				return fmt.Errorf("exam: question %s declares difficulty %q, but the bank declares no spec.difficultyMix to draw against", q.ID, q.Difficulty)
			}
		}
		return nil
	}

	total := 0
	for tier, share := range e.DifficultyMix {
		if _, ok := tierBounds[tier]; !ok {
			return fmt.Errorf("exam: spec.difficultyMix names an unknown tier %q, want one of %s", tier, strings.Join(tierOrder, ", "))
		}
		if share < 0 {
			return fmt.Errorf("exam: spec.difficultyMix gives %s a negative share %d", tier, share)
		}
		total += share
	}
	if total != 100 {
		return fmt.Errorf("exam: spec.difficultyMix sums to %d, want 100", total)
	}

	for _, q := range e.Questions {
		bounds, ok := tierBounds[q.Difficulty]
		if !ok {
			return fmt.Errorf("exam: question %s has difficulty %q, want one of %s — a bank declaring spec.difficultyMix declares a tier on every question", q.ID, q.Difficulty, strings.Join(tierOrder, ", "))
		}
		if q.TargetSeconds == 0 {
			return fmt.Errorf("exam: question %s is %s but sets no targetSeconds; the tier is the time band, so it cannot be derived from the question's share of the points", q.ID, q.Difficulty)
		}
		if q.TargetSeconds < bounds[0] || q.TargetSeconds > bounds[1] {
			return fmt.Errorf("exam: question %s is %s with targetSeconds %d, outside that tier's %d-%d band", q.ID, q.Difficulty, q.TargetSeconds, bounds[0], bounds[1])
		}
	}

	held := map[string]bool{}
	for _, q := range e.Questions {
		held[q.Difficulty] = true
	}
	for _, tier := range tierOrder {
		if e.DifficultyMix[tier] > 0 && !held[tier] {
			return fmt.Errorf("exam: spec.difficultyMix asks for %d%% %s questions and the bank holds none", e.DifficultyMix[tier], tier)
		}
	}
	return nil
}

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

		return nil
	}
	return out
}

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

func loadChecks(bankDir, qid string) ([]Check, error) {
	pattern := filepath.Join(bankDir, qid, "validate.d", "*.sh")
	paths, err := filepath.Glob(pattern)
	if err != nil {
		return nil, fmt.Errorf("exam: glob %s: %w", pattern, err)
	}
	if len(paths) == 0 {
		return nil, fmt.Errorf("exam: question %s has no validate.d scripts in %s", qid, filepath.Join(bankDir, qid, "validate.d"))
	}

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

const (
	pointsPrefix = "# points: "
	descPrefix   = "# desc: "
)

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

var hintHeading = regexp.MustCompile(`(?m)^##\s+Hint\s+\d+\s*$`)

func HintsPath(bankDir, qid string) string {
	return filepath.Join(bankDir, qid, "hints.md")
}

func countHints(bankDir, qid string) int {
	raw, err := os.ReadFile(HintsPath(bankDir, qid))
	if err != nil {
		return 0
	}
	return len(hintHeading.FindAllIndex(raw, -1))
}

func TipsPath(bankDir string) string {
	return filepath.Join(bankDir, "tips.md")
}

func hasTips(bankDir string) bool {
	info, err := os.Stat(TipsPath(bankDir))
	return err == nil && !info.IsDir() && info.Size() > 0
}

type DrawOptions struct {
	Seed string

	Domains []string

	Length int
}

type DrawResult struct {
	IDs []string

	Seed string

	Domains []string

	PoolDigest string
}

var ErrDrawRequest = errors.New("exam: invalid draw request")

var seedPattern = regexp.MustCompile(`^[0-9a-f]{6}$`)

func Draw(ex *Exam, opts DrawOptions) (DrawResult, error) {
	seed, err := resolveSeed(opts.Seed)
	if err != nil {
		return DrawResult{}, err
	}

	filter, err := resolveDomains(opts.Domains, domainOrder(ex.Questions))
	if err != nil {
		return DrawResult{}, err
	}

	res := DrawResult{Seed: seed, Domains: filter, PoolDigest: PoolDigest(ex)}

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

	if len(ex.DifficultyMix) > 0 {
		ids, err := drawMixed(ex, inScope, order, targets, length, seed)
		if err != nil {
			return DrawResult{}, err
		}
		res.IDs = ids
		return res, nil
	}

	drawn := make([]string, 0, length)
	for _, d := range order {
		k := targets[d]
		pool := poolByDomain[d]
		if k > len(pool) {
			return DrawResult{}, fmt.Errorf("exam: domain %q needs %d questions for a %d-question draw, pool has only %d", d, k, length, len(pool))
		}

		drawn = append(drawn, shuffle(pool, seed, d)[:k]...)
	}
	res.IDs = drawn
	return res, nil
}

// The domain targets are a hard constraint and the tier mix a soft one:
// spec.domainWeights is the promise the graders weight a score by, while
// the mix only shapes how tiring the sitting is. So each domain takes its
// exact count and spends it on whichever tier is furthest behind, and any
// shortfall carries to the next domain rather than bending the split.
func drawMixed(ex *Exam, inScope []Question, order []string, targets map[string]int, length int, seed string) ([]string, error) {
	byDomainTier := map[string]map[string][]string{}
	for _, q := range inScope {
		if byDomainTier[q.Domain] == nil {
			byDomainTier[q.Domain] = map[string][]string{}
		}
		byDomainTier[q.Domain][q.Difficulty] = append(byDomainTier[q.Domain][q.Difficulty], q.ID)
	}

	totalShare := 0
	for _, t := range tierOrder {
		totalShare += ex.DifficultyMix[t]
	}
	deficit := largestRemainder(ex.DifficultyMix, tierOrder, length, totalShare)

	drawn := make([]string, 0, length)
	for _, d := range order {
		k := targets[d]
		queues := make(map[string][]string, len(tierOrder))
		held := 0
		for _, t := range tierOrder {
			queues[t] = shuffle(byDomainTier[d][t], seed, d+"\x00"+t)
			held += len(queues[t])
		}
		if k > held {
			return nil, fmt.Errorf("exam: domain %q needs %d questions for a %d-question draw, pool has only %d", d, k, length, held)
		}
		for i := 0; i < k; i++ {
			t := neediestTier(deficit, queues)
			drawn = append(drawn, queues[t][0])
			queues[t] = queues[t][1:]
			deficit[t]--
		}
	}
	return drawn, nil
}

func neediestTier(deficit map[string]int, queues map[string][]string) string {
	best := ""
	for _, t := range tierOrder {
		if len(queues[t]) == 0 {
			continue
		}
		if best == "" || deficit[t] > deficit[best] {
			best = t
		}
	}
	return best
}

func questionIDs(questions []Question) []string {
	out := make([]string, len(questions))
	for i, q := range questions {
		out[i] = q.ID
	}
	return out
}

func resolveSeed(seed string) (string, error) {
	if seed == "" {
		return mintSeed()
	}
	if !seedPattern.MatchString(seed) {
		return "", fmt.Errorf("%w: seed %q must be six lowercase hex digits", ErrDrawRequest, seed)
	}
	return seed, nil
}

func mintSeed() (string, error) {
	var b [3]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", fmt.Errorf("exam: mint seed: %w", err)
	}
	return hex.EncodeToString(b[:]), nil
}

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

func PoolDigest(ex *Exam) string {
	h := sha256.New()
	for _, q := range ex.Questions {
		io.WriteString(h, q.ID)
		h.Write([]byte{0})
		io.WriteString(h, q.Domain)
		h.Write([]byte{0})
	}

	return hex.EncodeToString(h.Sum(nil)[:6])
}

var ErrPoolChanged = errors.New("exam: the question bank changed after this attempt was drawn")

func CheckPool(ex *Exam, digest string) error {
	if digest == "" {
		return nil
	}
	if got := PoolDigest(ex); got != digest {
		return fmt.Errorf("%w: it was drawn from pool %s, the loaded bank is %s", ErrPoolChanged, digest, got)
	}
	return nil
}

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

func domainTargets(domainWeights map[string]int, order []string, n int) (map[string]int, error) {
	if len(domainWeights) == 0 {
		return nil, fmt.Errorf("exam: spec.domainWeights is required to draw a %d-question subset", n)
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

	targets := largestRemainder(domainWeights, order, n, totalWeight)
	assigned := 0
	for _, d := range order {
		assigned += targets[d]
	}
	if assigned != n {
		return nil, fmt.Errorf("exam: domainWeights do not add up cleanly for a %d-question draw", n)
	}
	return targets, nil
}

func largestRemainder(weights map[string]int, order []string, n, totalWeight int) map[string]int {
	type remainder struct {
		key   string
		frac  float64
		index int
	}

	targets := make(map[string]int, len(order))
	remainders := make([]remainder, 0, len(order))
	assigned := 0
	for i, k := range order {
		raw := float64(weights[k]) * float64(n) / float64(totalWeight)
		floor := int(raw)
		targets[k] = floor
		assigned += floor
		remainders = append(remainders, remainder{key: k, frac: raw - float64(floor), index: i})
	}

	sort.Slice(remainders, func(i, j int) bool {
		if remainders[i].frac != remainders[j].frac {
			return remainders[i].frac > remainders[j].frac
		}
		return remainders[i].index < remainders[j].index
	})
	for i := 0; i < n-assigned && i < len(remainders); i++ {
		targets[remainders[i].key]++
	}
	return targets
}

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

type drawStream struct {
	key     []byte
	counter uint64
	block   [sha256.Size]byte
	used    int
}

func newDrawStream(seed, label string) *drawStream {

	key := make([]byte, 0, len(seed)+len(label)+2)
	key = append(key, seed...)
	key = append(key, 0)
	key = append(key, label...)
	key = append(key, 0)

	return &drawStream{key: key, used: sha256.Size}
}

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
