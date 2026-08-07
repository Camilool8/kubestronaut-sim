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

func legacyMessage(out string) string { return strings.TrimRight(out, "\n") }

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
		msg, _, arts := splitArtifacts(out)
		if want := legacyMessage(out); msg != want {
			t.Errorf("splitArtifacts(%q) message = %q, want %q (the pre-artifact expression)", out, msg, want)
		}
		if arts != nil {
			t.Errorf("splitArtifacts(%q) produced %d artifacts, want none", out, len(arts))
		}
	}
}

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

func FuzzSplitArtifactsPreservesMessage(f *testing.F) {
	for _, out := range sampleCheckOutputs {
		f.Add(out)
	}
	f.Fuzz(func(t *testing.T, out string) {
		if sentinelStart(out) >= 0 {
			return
		}
		msg, _, arts := splitArtifacts(out)
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

	msg, _, arts := splitArtifacts(out)
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

	msg, _, arts := splitArtifacts("---8<--- sim:artifact why text\nnothing to say first\n")
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
			msg, _, arts := splitArtifacts(out)

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

	_, _, arts := splitArtifacts(out)
	want := []CheckArtifact{
		{Kind: "actual", Lang: "yaml", Body: "kind: Service"},
		{Kind: "why", Lang: "text", Body: "and this one is not"},
	}
	if !reflect.DeepEqual(arts, want) {
		t.Errorf("artifacts = %#v, want %#v", arts, want)
	}
}

func TestSplitArtifactsReadsCriteria(t *testing.T) {
	out := "runAsNonRoot='', want true\n" +
		"---8<--- sim:criterion pass 1 runs as uid 10001\n" +
		"---8<--- sim:criterion pass 2 drops all capabilities\n" +
		"---8<--- sim:criterion fail 1 refuses to start as root\n"
	msg, crits, arts := splitArtifacts(out)

	if msg != "runAsNonRoot='', want true" {
		t.Errorf("message = %q", msg)
	}
	if len(arts) != 0 {
		t.Errorf("artifacts = %#v, want none", arts)
	}
	want := []Criterion{
		{Desc: "runs as uid 10001", Weight: 1, Passed: true},
		{Desc: "drops all capabilities", Weight: 2, Passed: true},
		{Desc: "refuses to start as root", Weight: 1, Passed: false},
	}
	if !reflect.DeepEqual(crits, want) {
		t.Errorf("criteria = %#v, want %#v", crits, want)
	}
}

// Criteria are emitted after the evidence panes, so a criterion sentinel has to
// close the artifact that is open rather than being swallowed into its body.
func TestSplitArtifactsCriterionClosesAnOpenArtifact(t *testing.T) {
	out := "msg\n" +
		"---8<--- sim:artifact actual yaml\nkind: Pod\n" +
		"---8<--- sim:criterion fail 1 read-only root filesystem\n"
	msg, crits, arts := splitArtifacts(out)

	if msg != "msg" {
		t.Errorf("message = %q", msg)
	}
	if len(arts) != 1 || arts[0].Body != "kind: Pod" {
		t.Fatalf("artifacts = %#v, want one holding just the yaml", arts)
	}
	if len(crits) != 1 || crits[0].Desc != "read-only root filesystem" {
		t.Errorf("criteria = %#v", crits)
	}
}

func TestSplitArtifactsIgnoresMalformedCriteria(t *testing.T) {
	for _, line := range []string{
		"---8<--- sim:criterion",
		"---8<--- sim:criterion pass",
		"---8<--- sim:criterion pass 1",
		"---8<--- sim:criterion maybe 1 desc",
		"---8<--- sim:criterion pass x desc",
		"---8<--- sim:criterion pass -1 desc",
	} {
		_, crits, _ := splitArtifacts("msg\n" + line + "\n")
		if len(crits) != 0 {
			t.Errorf("%q produced %#v, want none", line, crits)
		}
	}
}

func TestPartialEarned(t *testing.T) {
	crits := func(points ...int) []Criterion {
		// positive weight = passed, negative = failed
		var cs []Criterion
		for _, p := range points {
			if p > 0 {
				cs = append(cs, Criterion{Weight: p, Passed: true})
			} else {
				cs = append(cs, Criterion{Weight: -p})
			}
		}
		return cs
	}
	cases := []struct {
		name   string
		points int
		crits  []Criterion
		want   int
	}{
		{"two of three", 3, crits(1, 1, -1), 2},
		{"all passed", 3, crits(1, 1, 1), 3},
		{"none passed", 3, crits(-1, -1, -1), 0},
		// A near miss must never round up to full marks.
		{"eleven of twelve", 4, crits(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, -1), 3},
		{"two of twelve", 4, crits(1, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1), 1},
		// A one-point check cannot be split.
		{"one point partial", 1, crits(1, -1), 0},
		{"weights respected", 6, crits(3, -3), 3},
		{"no criteria at all", 4, nil, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := partialEarned(c.points, c.crits); got != c.want {
				t.Errorf("partialEarned(%d, %v) = %d, want %d", c.points, c.crits, got, c.want)
			}
		})
	}
}

// A sentinel with nothing under it means the check looked and found nothing —
// a missing object, or a container under a name nobody used. That is the pane
// the candidate needs most, so it has to survive as an explicit statement
// rather than disappearing and leaving only "field='', want x".
func TestSplitArtifactsKeepsEmptyBodiesAsAnExplicitMarker(t *testing.T) {
	out := "msg\n---8<--- sim:artifact actual yaml\n---8<--- sim:artifact why text\nreal\n"
	_, _, arts := splitArtifacts(out)
	want := []CheckArtifact{
		{Kind: "actual", Lang: "text", Body: emptyArtifactBody},
		{Kind: "why", Lang: "text", Body: "real"},
	}
	if !reflect.DeepEqual(arts, want) {
		t.Errorf("artifacts = %#v, want %#v", arts, want)
	}
}

func TestSplitArtifactsTreatsWhitespaceOnlyBodyAsEmpty(t *testing.T) {
	out := "msg\n---8<--- sim:artifact actual json\n   \n\t\n"
	_, _, arts := splitArtifacts(out)
	want := []CheckArtifact{{Kind: "actual", Lang: "text", Body: emptyArtifactBody}}
	if !reflect.DeepEqual(arts, want) {
		t.Errorf("artifacts = %#v, want %#v", arts, want)
	}
}

// The empty marker must not consume the per-check budget meant for real
// evidence, nor push a genuine artifact out of the eight-artifact window.
func TestSplitArtifactsEmptyMarkerDoesNotCrowdOutRealEvidence(t *testing.T) {
	out := "msg\n---8<--- sim:artifact actual yaml\n---8<--- sim:artifact expected yaml\nkind: Pod\n"
	_, _, arts := splitArtifacts(out)
	if len(arts) != 2 {
		t.Fatalf("artifacts = %#v, want 2", arts)
	}
	if arts[1].Body != "kind: Pod" {
		t.Errorf("real evidence = %q, want %q", arts[1].Body, "kind: Pod")
	}
}

func TestSplitArtifactsTruncatesOneOversizedDocument(t *testing.T) {
	huge := strings.Repeat("a: 0123456789abcdef\n", 2000)
	msg, _, arts := splitArtifacts("msg\n---8<--- sim:artifact actual yaml\n" + huge)

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
	_, _, arts := splitArtifacts(b.String())

	total := 0
	for _, a := range arts {
		total += len(a.Body)
	}

	if total > maxCheckArtifactBytes+len(arts)*128 {
		t.Errorf("kept %d bytes across %d artifacts, want at most the %d-byte budget", total, len(arts), maxCheckArtifactBytes)
	}

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
	_, _, arts := splitArtifacts(b.String())

	if len(arts) != maxCheckArtifacts {
		t.Errorf("kept %d artifacts, want the %d cap", len(arts), maxCheckArtifacts)
	}
	if !strings.Contains(arts[len(arts)-1].Body, "more artifacts dropped") {
		t.Errorf("dropped artifacts left no trace: %q", arts[len(arts)-1].Body)
	}
}

func TestSplitArtifactsTruncatesOnARuneBoundary(t *testing.T) {

	line := strings.Repeat("日", maxArtifactBytes)
	_, _, arts := splitArtifacts("msg\n---8<--- sim:artifact actual text\n" + line + "\n")

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
