package evaluate

import (
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	artifactSentinel      = "---8<--- sim:artifact"
	criterionSentinel     = "---8<--- sim:criterion"
	maxArtifactBytes      = 8 << 10
	maxCheckArtifactBytes = 24 << 10
	maxCheckArtifacts     = 8
	maxCriteria           = 32
)

// One graded thing inside a check. A check used to be all-or-nothing, so a
// Deployment missing one field out of six scored the same as one nobody had
// touched; criteria split the check's points across what it actually grades.
// Weights are relative — the check's `# points:` header stays the total.
type Criterion struct {
	Desc   string `json:"desc"`
	Weight int    `json:"weight"`
	Passed bool   `json:"passed"`
}

// Scales a check's points by the criterion weight earned.
//
// A criterion that failed must cost something, so a near miss is clamped below
// full marks rather than rounding up to them: eleven of twelve on a four-point
// check is 3, never 4. Points that cannot be divided (a one-point check) stay
// all-or-nothing.
func partialEarned(points int, criteria []Criterion) int {
	total, passed := 0, 0
	for _, c := range criteria {
		total += c.Weight
		if c.Passed {
			passed += c.Weight
		}
	}
	switch {
	case total <= 0, passed <= 0:
		return 0
	case passed >= total:
		return points
	case points <= 1:
		return 0
	}
	earned := (points*passed*2 + total) / (total * 2)
	if earned >= points {
		earned = points - 1
	}
	return earned
}

// Stands in for a pane a check opened and then had nothing to put in, which is
// what a lookup by a name nothing matches produces. Dropping those panes hid
// the one fact that explained the failure, so an opened sentinel always
// becomes an artifact. banks/_lib/checks.sh substitutes a wordier line of its
// own before the output ever gets here; this is the backstop for checks that
// build the sentinel themselves.
const emptyArtifactBody = "none — the check found nothing here"

type CheckArtifact struct {
	Kind string `json:"kind"`

	Lang string `json:"lang,omitempty"`
	Body string `json:"body"`
}

func splitArtifacts(out string) (string, []Criterion, []CheckArtifact) {
	start := sentinelStart(out)
	if start < 0 {
		return strings.TrimRight(out, "\n"), nil, nil
	}
	message := strings.TrimRight(out[:start], "\n")

	var (
		arts    []CheckArtifact
		crits   []Criterion
		open    *artifactBuf
		budget  = maxCheckArtifactBytes
		dropped int
	)
	closeOpen := func() {
		if open == nil {
			return
		}
		a := open.result()
		if strings.TrimSpace(a.Body) == "" {
			a.Lang, a.Body = "text", emptyArtifactBody
		}
		arts = append(arts, a)
		budget -= len(a.Body)
		open = nil
	}

	for rest := out[start:]; rest != ""; {
		var line string
		line, rest = nextLine(rest)

		// Criteria are emitted after the evidence panes, so one has to close
		// whatever artifact is open rather than land inside its body.
		if strings.HasPrefix(line, criterionSentinel) {
			closeOpen()
			if c, ok := parseCriterion(line); ok && len(crits) < maxCriteria {
				crits = append(crits, c)
			}
			continue
		}
		if !strings.HasPrefix(line, artifactSentinel) {
			if open != nil {
				open.addLine(line)
			}
			continue
		}
		closeOpen()
		kind, lang, ok := parseSentinel(line)
		if !ok {
			continue
		}
		if len(arts) >= maxCheckArtifacts {
			dropped++
			continue
		}
		limit := maxArtifactBytes
		if limit > budget {
			limit = budget
		}
		open = &artifactBuf{kind: kind, lang: lang, limit: limit}
	}
	closeOpen()

	if dropped > 0 && len(arts) > 0 {
		arts[len(arts)-1].Body += fmt.Sprintf("\n[truncated by the grader: %d more artifacts dropped, limit is %d]", dropped, maxCheckArtifacts)
	}
	return message, crits, arts
}

// ---8<--- sim:criterion <pass|fail> <weight> <desc...>
func parseCriterion(line string) (Criterion, bool) {
	rest, found := strings.CutPrefix(line, criterionSentinel+" ")
	if !found {
		return Criterion{}, false
	}
	verdict, rest, found := strings.Cut(rest, " ")
	if !found {
		return Criterion{}, false
	}
	weight, desc, found := strings.Cut(rest, " ")
	if !found {
		return Criterion{}, false
	}
	desc = strings.TrimSpace(desc)
	if desc == "" {
		return Criterion{}, false
	}
	w, err := strconv.Atoi(weight)
	if err != nil || w <= 0 {
		return Criterion{}, false
	}
	switch verdict {
	case "pass":
		return Criterion{Desc: desc, Weight: w, Passed: true}, true
	case "fail":
		return Criterion{Desc: desc, Weight: w}, true
	}
	return Criterion{}, false
}

func sentinelStart(s string) int {
	best := -1
	for _, sentinel := range []string{artifactSentinel, criterionSentinel} {
		if strings.HasPrefix(s, sentinel) {
			return 0
		}
		if i := strings.Index(s, "\n"+sentinel); i >= 0 && (best < 0 || i < best) {
			best = i
		}
	}
	if best < 0 {
		return -1
	}
	return best + 1
}

func nextLine(s string) (line, rest string) {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i], s[i+1:]
	}
	return s, ""
}

func parseSentinel(line string) (kind, lang string, ok bool) {
	rest, found := strings.CutPrefix(line, artifactSentinel+" ")
	if !found {
		return "", "", false
	}
	kind, lang, found = strings.Cut(rest, " ")
	if !found {
		return "", "", false
	}
	switch kind {
	case "actual", "expected", "why":
	default:
		return "", "", false
	}
	if !validLang(lang) {
		return "", "", false
	}
	return kind, lang, true
}

func validLang(s string) bool {
	if s == "" || len(s) > 16 {
		return false
	}
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '_', r == '+', r == '-':
		default:
			return false
		}
	}
	return true
}

type artifactBuf struct {
	kind, lang string
	limit      int
	b          strings.Builder
	total      int
}

func (a *artifactBuf) addLine(line string) {
	a.total += len(line) + 1
	room := a.limit - a.b.Len()
	if room <= 0 {
		return
	}
	if len(line)+1 <= room {
		a.b.WriteString(line)
		a.b.WriteByte('\n')
		return
	}
	a.b.WriteString(cutRunes(line[:room]))

	a.limit = a.b.Len()
}

func (a *artifactBuf) result() CheckArtifact {
	body := strings.TrimRight(a.b.String(), "\n")
	if a.b.Len() < a.total {
		if body != "" {
			body += "\n"
		}
		body += fmt.Sprintf("[truncated by the grader: kept %d of %d bytes]", a.b.Len(), a.total)
	}
	return CheckArtifact{Kind: a.kind, Lang: a.lang, Body: body}
}

func cutRunes(s string) string {
	for i := 0; i < 3 && s != ""; i++ {
		if r, size := utf8.DecodeLastRuneInString(s); r != utf8.RuneError || size > 1 {
			break
		}
		s = s[:len(s)-1]
	}
	return s
}
