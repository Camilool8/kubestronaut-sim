package evaluate

import (
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"kubestronaut-sim/facilitator/internal/exam"
)

// legacyMessage is the ENTIRE body of gradeCheck's default branch before
// the artifact protocol existed, copied verbatim:
//
//	cr.Message = strings.TrimRight(out, "\n")
//
// Every test below that asserts "byte-identical to today" compares
// against this and nothing else, so the claim cannot drift as
// splitArtifacts changes.
func legacyMessage(out string) string { return strings.TrimRight(out, "\n") }

// sampleCheckOutputs is what the 75 shipped CKAD checks actually print,
// in shape: one short line, a line with quoted values, the multi-line
// case, the empty case, and the near-misses that must NOT be read as a
// sentinel. None of them may parse to anything but their own text.
var sampleCheckOutputs = []string{
	"",
	"\n",
	"service fixed",
	"service fixed\n",
	"service fixed\n\n\n",
	"selector is 'app=inventory-api', want app=inventory",
	"the Service has 0 ready endpoints, want 2",
	"got '', want '*/5 * * * *|Forbid|2|1'",
	"line one\nline two\nline three\n",
	"---",
	"---\napiVersion: v1\n",
	"a yaml stream:\n---\nkind: Pod\n---\nkind: Service\n",
	"---8<---",
	"---8<--- cut here",
	"--8<--- sim:artifact actual yaml\nnot a sentinel: one dash short\n",
	" ---8<--- sim:artifact actual yaml\nindented, so it is message text\n",
	"trailing text ---8<--- sim:artifact actual yaml\n",
	"sim:artifact actual yaml\n",
	"\t---8<--- sim:artifact why text\n",
	"unicode: naïve ≠ naive — 日本語\n",
	"the Service did not answer (got: curl: (7) Failed to connect)",
}

func TestSplitArtifactsLeavesTodaysMessageByteIdentical(t *testing.T) {
	for _, out := range sampleCheckOutputs {
		msg, arts := splitArtifacts(out)
		if want := legacyMessage(out); msg != want {
			t.Errorf("splitArtifacts(%q) message = %q, want %q (the pre-artifact expression)", out, msg, want)
		}
		if arts != nil {
			t.Errorf("splitArtifacts(%q) produced %d artifacts, want none", out, len(arts))
		}
	}
}

// TestGradeCheckIsUnchangedForChecksWithoutArtifacts is the zero-edit
// claim at the level that matters: not the parser in isolation, but the
// CheckResult a real Grade run builds. All 75 shipped CKAD checks emit no
// sentinel, so every field of their result must be what it was before the
// protocol existed.
func TestGradeCheckIsUnchangedForChecksWithoutArtifacts(t *testing.T) {
	q := exam.Question{ID: "q19", Instance: "instance-1"}
	c := exam.Check{Name: "10_service.sh", Desc: "the Service selects the Pods", Points: 3}

	for _, out := range sampleCheckOutputs {
		for _, ok := range []bool{true, false} {
			r := &fakeRunner{byName: map[string]resp{"10_service.sh": {out: out, ok: ok}}}
			got := gradeCheck(r, "ckad-mock-01", q, c, time.Minute)

			want := CheckResult{Name: c.Name, Desc: c.Desc, Points: c.Points, Message: legacyMessage(out)}
			if ok {
				want.Passed, want.Earned = true, c.Points
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("gradeCheck(out=%q, ok=%v) = %#v, want %#v", out, ok, got, want)
			}
		}
	}
}

// FuzzSplitArtifactsPreservesMessage generalises the claim past the
// corpus: for ANY output with no sentinel at column 0, the message is
// exactly strings.TrimRight(out, "\n") and there are no artifacts. This
// is the property the 75 unedited checks rely on.
func FuzzSplitArtifactsPreservesMessage(f *testing.F) {
	for _, out := range sampleCheckOutputs {
		f.Add(out)
	}
	f.Fuzz(func(t *testing.T, out string) {
		if sentinelStart(out) >= 0 {
			return // carries a sentinel; a different contract applies
		}
		msg, arts := splitArtifacts(out)
		if want := legacyMessage(out); msg != want {
			t.Errorf("message = %q, want %q", msg, want)
		}
		if arts != nil {
			t.Errorf("got %d artifacts, want none", len(arts))
		}
	})
}

func TestSplitArtifacts(t *testing.T) {
	out := "selector is 'app=inventory-api', want app=inventory\n" +
		"---8<--- sim:artifact actual yaml\n" +
		"apiVersion: v1\nkind: Service\n" +
		"---8<--- sim:artifact expected yaml\n" +
		"apiVersion: v1\nkind: Service\nspec:\n  selector:\n    app: inventory\n" +
		"---8<--- sim:artifact why text\n" +
		"The Service selector does not match the Pod labels, so the\n" +
		"Endpoints list is empty and the Ingress has nothing to route to.\n"

	msg, arts := splitArtifacts(out)
	if want := "selector is 'app=inventory-api', want app=inventory"; msg != want {
		t.Errorf("message = %q, want %q", msg, want)
	}
	want := []CheckArtifact{
		{Kind: "actual", Lang: "yaml", Body: "apiVersion: v1\nkind: Service"},
		{Kind: "expected", Lang: "yaml", Body: "apiVersion: v1\nkind: Service\nspec:\n  selector:\n    app: inventory"},
		{Kind: "why", Lang: "text", Body: "The Service selector does not match the Pod labels, so the\nEndpoints list is empty and the Ingress has nothing to route to."},
	}
	if !reflect.DeepEqual(arts, want) {
		t.Errorf("artifacts = %#v, want %#v", arts, want)
	}
}

func TestSplitArtifactsAtStartOfOutput(t *testing.T) {
	// A check that prints no message at all still parses: the message is
	// empty, which is what it would have been before the protocol too.
	msg, arts := splitArtifacts("---8<--- sim:artifact why text\nnothing to say first\n")
	if msg != "" {
		t.Errorf("message = %q, want empty", msg)
	}
	if len(arts) != 1 || arts[0].Body != "nothing to say first" {
		t.Errorf("artifacts = %#v", arts)
	}
}

func TestSplitArtifactsMalformedSentinel(t *testing.T) {
	cases := []struct {
		name string
		line string
	}{
		{"unknown kind", "---8<--- sim:artifact wanted yaml"},
		{"kind case matters", "---8<--- sim:artifact Actual yaml"},
		{"missing lang", "---8<--- sim:artifact actual"},
		{"no space after prefix", "---8<--- sim:artifactactual yaml"},
		{"trailing field", "---8<--- sim:artifact actual yaml extra"},
		{"lang with a slash", "---8<--- sim:artifact actual application/yaml"},
		{"empty lang", "---8<--- sim:artifact actual "},
		{"double space", "---8<--- sim:artifact  actual yaml"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out := "the real message\n" + tc.line + "\nkind: Service\napiVersion: v1\n"
			msg, arts := splitArtifacts(out)

			// A bank typo must never cost the candidate their message,
			// and must never spill a YAML document into it either.
			if msg != "the real message" {
				t.Errorf("message = %q, want %q", msg, "the real message")
			}
			if arts != nil {
				t.Errorf("artifacts = %#v, want none", arts)
			}
		})
	}
}

func TestSplitArtifactsMalformedSentinelDoesNotEatItsNeighbours(t *testing.T) {
	out := "msg\n" +
		"---8<--- sim:artifact actual yaml\nkind: Service\n" +
		"---8<--- sim:artifact wat yaml\nthis block is discarded\n" +
		"---8<--- sim:artifact why text\nand this one is not\n"

	_, arts := splitArtifacts(out)
	want := []CheckArtifact{
		{Kind: "actual", Lang: "yaml", Body: "kind: Service"},
		{Kind: "why", Lang: "text", Body: "and this one is not"},
	}
	if !reflect.DeepEqual(arts, want) {
		t.Errorf("artifacts = %#v, want %#v", arts, want)
	}
}

func TestSplitArtifactsDropsEmptyBodies(t *testing.T) {
	out := "msg\n---8<--- sim:artifact actual yaml\n---8<--- sim:artifact why text\nreal\n"
	_, arts := splitArtifacts(out)
	want := []CheckArtifact{{Kind: "why", Lang: "text", Body: "real"}}
	if !reflect.DeepEqual(arts, want) {
		t.Errorf("artifacts = %#v, want %#v", arts, want)
	}
}

func TestSplitArtifactsTruncatesOneOversizedDocument(t *testing.T) {
	huge := strings.Repeat("a: 0123456789abcdef\n", 2000) // ~40k, well past the per-artifact cap
	msg, arts := splitArtifacts("msg\n---8<--- sim:artifact actual yaml\n" + huge)

	if msg != "msg" {
		t.Errorf("message = %q", msg)
	}
	if len(arts) != 1 {
		t.Fatalf("artifacts = %#v", arts)
	}
	if n := len(arts[0].Body); n > maxArtifactBytes+128 {
		t.Errorf("body is %d bytes, want at most the %d-byte cap plus the marker", n, maxArtifactBytes)
	}
	if !strings.Contains(arts[0].Body, "[truncated by the grader:") {
		t.Errorf("truncation is invisible; body tail = %q", arts[0].Body[max(0, len(arts[0].Body)-120):])
	}
}

func TestSplitArtifactsCapsTheWholeCheck(t *testing.T) {
	var b strings.Builder
	b.WriteString("msg\n")
	for range 6 {
		b.WriteString("---8<--- sim:artifact actual yaml\n")
		b.WriteString(strings.Repeat("a: 0123456789abcdef\n", 2000))
	}
	_, arts := splitArtifacts(b.String())

	total := 0
	for _, a := range arts {
		total += len(a.Body)
	}
	// Every artifact carries its own marker, so the budget is exceeded by
	// at most one marker each — never by another document.
	if total > maxCheckArtifactBytes+len(arts)*128 {
		t.Errorf("kept %d bytes across %d artifacts, want at most the %d-byte budget", total, len(arts), maxCheckArtifactBytes)
	}
	// The starved ones are still visible: the explanation screen should
	// say "expected was too big", not quietly omit the pane.
	last := arts[len(arts)-1]
	if !strings.Contains(last.Body, "[truncated by the grader:") {
		t.Errorf("last artifact hides its truncation: %q", last.Body)
	}
}

func TestSplitArtifactsCapsTheArtifactCount(t *testing.T) {
	var b strings.Builder
	b.WriteString("msg\n")
	for i := range 50 {
		b.WriteString("---8<--- sim:artifact why text\n")
		b.WriteString("block ")
		b.WriteString(strings.Repeat("x", i%5))
		b.WriteString("\n")
	}
	_, arts := splitArtifacts(b.String())

	if len(arts) != maxCheckArtifacts {
		t.Errorf("kept %d artifacts, want the %d cap", len(arts), maxCheckArtifacts)
	}
	if !strings.Contains(arts[len(arts)-1].Body, "more artifacts dropped") {
		t.Errorf("dropped artifacts left no trace: %q", arts[len(arts)-1].Body)
	}
}

func TestSplitArtifactsTruncatesOnARuneBoundary(t *testing.T) {
	// One line of multi-byte runes, long enough that the cut lands inside
	// one of them. Invalid UTF-8 would reach the client as U+FFFD with
	// nothing to say it came from truncation.
	line := strings.Repeat("日", maxArtifactBytes) // 3 bytes each
	_, arts := splitArtifacts("msg\n---8<--- sim:artifact actual text\n" + line + "\n")

	if len(arts) != 1 {
		t.Fatalf("artifacts = %d", len(arts))
	}
	if !utf8.ValidString(arts[0].Body) {
		t.Errorf("body is not valid UTF-8")
	}
}

func TestGradeCheckDropsArtifactsFromAPassingCheck(t *testing.T) {
	out := "service fixed\n---8<--- sim:artifact actual yaml\nkind: Service\n"
	q := exam.Question{ID: "q19", Instance: "instance-1"}
	c := exam.Check{Name: "10_service.sh", Desc: "svc", Points: 3}

	pass := gradeCheck(&fakeRunner{byName: map[string]resp{"10_service.sh": {out: out, ok: true}}}, "b", q, c, time.Minute)
	if pass.Artifacts != nil {
		t.Errorf("a passing check kept %d artifacts; a correct answer has nothing to explain", len(pass.Artifacts))
	}
	// The trailer is still stripped from the message either way.
	if pass.Message != "service fixed" {
		t.Errorf("passing message = %q, want %q", pass.Message, "service fixed")
	}

	fail := gradeCheck(&fakeRunner{byName: map[string]resp{"10_service.sh": {out: out, ok: false}}}, "b", q, c, time.Minute)
	if len(fail.Artifacts) != 1 || fail.Artifacts[0].Kind != "actual" {
		t.Errorf("a failing check lost its evidence: %#v", fail.Artifacts)
	}
}

func TestGradeCheckErrorPathsCarryNoArtifacts(t *testing.T) {
	q := exam.Question{ID: "q19", Instance: "instance-1"}
	c := exam.Check{Name: "10_service.sh", Desc: "svc", Points: 3}

	// A timeout never reads out at all, even when the partial stdout
	// happens to hold a well-formed trailer.
	timedOut := gradeCheck(blockingRunner{}, "b", q, c, time.Millisecond)
	if timedOut.Message != "check timed out" || timedOut.Artifacts != nil {
		t.Errorf("timeout = %#v, want message %q and no artifacts", timedOut, "check timed out")
	}

	wantErr := errors.New("dial tcp: connection refused")
	out := "partial\n---8<--- sim:artifact actual yaml\nkind: Service\n"
	transport := gradeCheck(&fakeRunner{byName: map[string]resp{
		"10_service.sh": {out: out, err: wantErr},
	}}, "b", q, c, time.Minute)
	if transport.Artifacts != nil {
		t.Errorf("transport error kept artifacts: %#v", transport.Artifacts)
	}
	if transport.Message != wantErr.Error() {
		t.Errorf("transport message = %q, want %q", transport.Message, wantErr.Error())
	}
}

func TestScoreboardShowsNoTrailer(t *testing.T) {
	// The plain-text scoreboard tests/smoke.sh greps has never carried
	// evidence and must not start: Message is already the head of the
	// output, so this asserts the trailer cannot leak in through it.
	r := &Results{Bank: "b", Questions: []QuestionResult{{
		ID: "q19", Instance: "instance-1", Checks: []CheckResult{{
			Name: "10_service.sh", Desc: "svc", Points: 3,
			Message:   "selector is 'app=inventory-api', want app=inventory",
			Artifacts: []CheckArtifact{{Kind: "actual", Lang: "yaml", Body: "kind: Service"}},
		}},
	}}}
	if got := r.Scoreboard(); strings.Contains(got, "kind: Service") || strings.Contains(got, artifactSentinel) {
		t.Errorf("scoreboard leaked an artifact:\n%s", got)
	}
}
