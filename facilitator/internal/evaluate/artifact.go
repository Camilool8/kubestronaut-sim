package evaluate

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

// The artifact protocol: how a check shows its work.
//
// A failed check used to tell a candidate only THAT they were wrong. The
// explanation screen wants two more things — what the cluster actually
// looked like, and what it was supposed to look like — and the only
// channel a check has is its stdout, which is already spoken for.
//
// So a check may append a trailer to that stdout:
//
//	selector is 'app=inventory-api', want app=inventory
//	---8<--- sim:artifact actual yaml
//	apiVersion: v1
//	kind: Service
//	...
//	---8<--- sim:artifact why text
//	The Service selector does not match the Pod labels, so it has no
//	endpoints and nothing can route to the Deployment.
//
// Everything before the first sentinel line is the message, unchanged.
// Each sentinel opens a body that runs to the next sentinel or to EOF.
// A check that emits no sentinel is parsed to a byte-identical message —
// which is the whole design constraint, since all 75 shipped CKAD checks
// predate this and none of them will be edited.
//
// The sentinel must start at column 0. That is both the parse rule and
// the escape hatch: a check whose legitimate output has to contain this
// string (grepping a file that documents the protocol, say) indents it
// by one space and it is ordinary message text again. Collision is
// vanishingly unlikely rather than impossible — "---8<---" is the
// conventional cut-here scissors and nothing kubectl, jq or yq emits —
// and YAML's own indentation rules protect embedded content for free,
// since a block scalar's lines are never at column 0.
const (
	// artifactSentinel opens a block. Recognition uses this prefix alone;
	// the grammar (kind, then lang) is checked separately, so a typo in
	// either still terminates the message rather than dumping a YAML
	// document into it.
	artifactSentinel = "---8<--- sim:artifact"

	// maxArtifactBytes caps one document. A cleaned Service is ~400
	// bytes, a cleaned Deployment ~1.5k, both Pods of a Deployment ~5k,
	// so 8k holds any evidence worth reading side by side while a
	// `kubectl get all -A -o yaml` — or a check with a runaway loop —
	// stops here.
	maxArtifactBytes = 8 << 10

	// maxCheckArtifactBytes caps one check's whole trailer. actual +
	// expected + why fit inside it comfortably; the number that matters
	// is the product, because this data is persisted verbatim by
	// session.Manager.SetResults and served back on every /api/results.
	// A candidate who fails every check of a full 22-question bank (88
	// checks) can grow their session file by at most ~2 MB.
	maxCheckArtifactBytes = 24 << 10

	// maxCheckArtifacts caps the COUNT, which the byte budget does not:
	// ten thousand empty blocks cost nothing in bytes and half a
	// megabyte in JSON object overhead. Eight is well past what a real
	// check needs (three kinds, occasionally two or three `actual`
	// documents).
	maxCheckArtifacts = 8
)

// CheckArtifact is one document a failed check attached to its result:
// the cluster state it found, the state it wanted, or prose explaining
// the gap. Its JSON tags are frozen by ui/src/api.ts.
type CheckArtifact struct {
	// Kind is exactly "actual", "expected" or "why" — a closed set,
	// because each one is a named region of the explanation screen and
	// a fourth value would arrive at a client with nowhere to put it.
	Kind string `json:"kind"`
	// Lang is a syntax-highlighting hint ("yaml", "text", …), carried
	// through verbatim from the sentinel. Absent means plain text.
	Lang string `json:"lang,omitempty"`
	Body string `json:"body"`
}

// splitArtifacts separates a check's stdout into the message and the
// documents it attached. Callers get exactly today's message —
// strings.TrimRight(out, "\n") — whenever out carries no sentinel, which
// is every check in every shipped bank.
//
// A malformed sentinel (unknown kind, missing or implausible lang) is
// never an error: the candidate is mid-exam and a bank bug must not cost
// them points, so the offending BLOCK is discarded and parsing resumes at
// the next sentinel. The message still ends at the first sentinel-prefixed
// line either way — a bank typo degrading to "no evidence" is a strictly
// better failure than one that pastes a Deployment into a one-line
// message. tests/check-lint.sh fails the malformed line offline, which is
// where a bank author is supposed to find out.
//
// Oversized bodies are truncated with a visible marker rather than
// dropped, and an artifact whose body is empty after all that is dropped:
// an empty pane on the explanation screen says less than no pane.
func splitArtifacts(out string) (string, []CheckArtifact) {
	start := sentinelStart(out)
	if start < 0 {
		return strings.TrimRight(out, "\n"), nil
	}
	message := strings.TrimRight(out[:start], "\n")

	var (
		arts    []CheckArtifact
		open    *artifactBuf
		budget  = maxCheckArtifactBytes
		dropped int
	)
	closeOpen := func() {
		if open == nil {
			return
		}
		if a := open.result(); a.Body != "" {
			arts = append(arts, a)
			budget -= len(a.Body)
		}
		open = nil
	}

	// Walked line by line with IndexByte rather than strings.Split: out
	// is already whatever size the check chose to print, and turning a
	// large one into a slice of every line would make this the first
	// place that multiplies it.
	for rest := out[start:]; rest != ""; {
		var line string
		line, rest = nextLine(rest)

		if !strings.HasPrefix(line, artifactSentinel) {
			if open != nil {
				open.addLine(line)
			}
			continue
		}
		closeOpen()
		kind, lang, ok := parseSentinel(line)
		if !ok {
			continue // open stays nil, so the block's body goes nowhere
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

	// Say so, on the last document that survived. A check that emitted
	// more blocks than the cap allows is a bank bug, and a silently
	// shorter list is exactly the kind of bug nobody notices.
	if dropped > 0 && len(arts) > 0 {
		arts[len(arts)-1].Body += fmt.Sprintf("\n[truncated by the grader: %d more artifacts dropped, limit is %d]", dropped, maxCheckArtifacts)
	}
	return message, arts
}

// sentinelStart returns the offset of the first line that opens an
// artifact block, or -1. Column 0 only, which is what makes the "indent
// it by one space" escape hatch work.
func sentinelStart(s string) int {
	if strings.HasPrefix(s, artifactSentinel) {
		return 0
	}
	if i := strings.Index(s, "\n"+artifactSentinel); i >= 0 {
		return i + 1
	}
	return -1
}

// nextLine splits s at its first newline, returning the line without it
// and everything after.
func nextLine(s string) (line, rest string) {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i], s[i+1:]
	}
	return s, ""
}

// parseSentinel reads "---8<--- sim:artifact <kind> <lang>" strictly.
// Exactly one space between each field and nothing after the lang: a
// sentinel is machine-written by show_actual/show_expected/show_why in
// banks/_lib/checks.sh, so there is no human spelling to be tolerant of,
// and tolerance here would only widen the collision surface.
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

// validLang accepts the shape of a highlighter tag and nothing else. It
// reaches a client as a CSS class and a highlighter key, so it is bounded
// and alphanumeric here rather than trusted there.
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

// artifactBuf accumulates one block's body under a byte limit while
// counting everything it was offered, so result can report the loss.
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
	// Pin the limit to what was actually written, so a partial line is
	// the last thing in the body. Without this, room reopens by the few
	// bytes the rune backoff gave up and later lines dribble in after a
	// cut one.
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

// cutRunes trims s back to a UTF-8 boundary. Cutting a multi-byte rune in
// half is not merely ugly: encoding/json rewrites the broken bytes as
// U+FFFD without complaining, so the seam would reach the candidate as
// replacement characters with nothing to say they came from truncation.
// Bounded to three steps because a check dumping binary is invalid all
// the way down and must not turn this into a scan of the whole body.
func cutRunes(s string) string {
	for i := 0; i < 3 && s != ""; i++ {
		if r, size := utf8.DecodeLastRuneInString(s); r != utf8.RuneError || size > 1 {
			break
		}
		s = s[:len(s)-1]
	}
	return s
}
