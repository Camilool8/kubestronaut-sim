package evaluate

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

const (
	artifactSentinel      = "---8<--- sim:artifact"
	maxArtifactBytes      = 8 << 10
	maxCheckArtifactBytes = 24 << 10
	maxCheckArtifacts     = 8
)

type CheckArtifact struct {
	Kind string `json:"kind"`

	Lang string `json:"lang,omitempty"`
	Body string `json:"body"`
}

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
	return message, arts
}

func sentinelStart(s string) int {
	if strings.HasPrefix(s, artifactSentinel) {
		return 0
	}
	if i := strings.Index(s, "\n"+artifactSentinel); i >= 0 {
		return i + 1
	}
	return -1
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
