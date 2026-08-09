package history

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"testing"

	"kubestronaut-sim/facilitator/internal/session"
)

// testdata/conformance.json is mirrored byte for byte in hub/internal/store/testdata/.
// The two modules cannot import one another, so those bytes are the whole of what they
// share: both roll the same attempts up with their own code and must land on the same
// expected summary. TestTheConformanceFixtureMatchesTheHubCopy holds the copies equal
// wherever both trees are checked out; the digest below catches an edit to this copy
// alone, which is all a single-module test run can see.
const (
	conformancePath   = "testdata/conformance.json"
	conformanceDigest = "1f8047e374062f760502133671f73d8907c69e9c33f6f885ed94dcc2221de243"

	mirrorModule = "../../../hub/go.mod"
	mirrorPath   = "../../../hub/internal/store/testdata/conformance.json"
)

type conformanceMode struct {
	Mode     string `json:"mode"`
	Recorded bool   `json:"recorded"`
}

type conformanceFixture struct {
	Modes    []conformanceMode `json:"modes"`
	Attempts []Record          `json:"attempts"`
	Expected Summary           `json:"expected"`
}

func readConformance(t *testing.T, path string) ([]byte, conformanceFixture) {
	t.Helper()

	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	b = bytes.ReplaceAll(b, []byte("\r\n"), []byte("\n"))

	var f conformanceFixture
	if err := json.Unmarshal(b, &f); err != nil {
		t.Fatalf("%s is not a conformance fixture: %v", path, err)
	}
	if len(f.Modes) == 0 || len(f.Attempts) == 0 || len(f.Expected.WeakDomains) == 0 {
		t.Fatalf("%s has %d modes, %d attempts and %d expected weak domains; an empty fixture agrees with everything",
			path, len(f.Modes), len(f.Attempts), len(f.Expected.WeakDomains))
	}
	return b, f
}

func TestTheConformanceFixtureIsTheAgreedBytes(t *testing.T) {
	b, _ := readConformance(t, conformancePath)

	sum := sha256.Sum256(b)
	if got := hex.EncodeToString(sum[:]); got != conformanceDigest {
		t.Errorf("%s hashes to %s, want %s; it is mirrored in hub/internal/store/testdata/, so change both copies and both digests together",
			conformancePath, got, conformanceDigest)
	}
}

func TestTheConformanceFixtureMatchesTheHubCopy(t *testing.T) {
	if _, err := os.Stat(mirrorModule); err != nil {
		t.Skipf("no hub module beside this one at %s; a single-module checkout cannot compare the copies", mirrorModule)
	}

	ours, _ := readConformance(t, conformancePath)
	theirs, _ := readConformance(t, mirrorPath)
	if !bytes.Equal(ours, theirs) {
		t.Errorf("%s and %s have drifted apart; they are one fixture kept in two places, and the whole point is that both modules summarise the same bytes",
			conformancePath, mirrorPath)
	}
}

func TestTheConformanceFixtureProducesTheAgreedSummary(t *testing.T) {
	_, f := readConformance(t, conformancePath)
	got := Summarize(f.Attempts)

	if got.Attempts != f.Expected.Attempts {
		t.Errorf("Attempts = %d, want %d", got.Attempts, f.Expected.Attempts)
	}
	if got.TrackCount != f.Expected.TrackCount {
		t.Errorf("TrackCount = %d, want %d", got.TrackCount, f.Expected.TrackCount)
	}
	if got.PassedCount != f.Expected.PassedCount {
		t.Errorf("PassedCount = %d, want %d; the fixture mixes training, a drill and an uncounted attempt so that this one number pins the counting rule the hub also has to reach",
			got.PassedCount, f.Expected.PassedCount)
	}

	if len(got.WeakDomains) != len(f.Expected.WeakDomains) {
		t.Fatalf("weak domains = %+v, want %+v", got.WeakDomains, f.Expected.WeakDomains)
	}
	for i, want := range f.Expected.WeakDomains {
		if got.WeakDomains[i] != want {
			t.Errorf("weak domain %d = %+v, want %+v", i, got.WeakDomains[i], want)
		}
	}
}

func TestTheConformanceFixtureAgreesWithSessionOnWhichModesCount(t *testing.T) {
	_, f := readConformance(t, conformancePath)

	declared := map[string]bool{}
	for _, m := range f.Modes {
		declared[m.Mode] = true

		r := Record{Mode: m.Mode, Counted: true}
		if got := r.counts(); got != m.Recorded {
			t.Errorf("a %q attempt counts = %v, but the shared fixture says recorded = %v; the hub reaches this verdict from its own literal and will not follow a change made here",
				m.Mode, got, m.Recorded)
		}
		if !session.ValidMode(m.Mode) {
			t.Errorf("the shared fixture declares mode %q, which session no longer has", m.Mode)
		}
	}
	for _, mode := range session.Modes() {
		if !declared[mode] {
			t.Errorf("session has mode %q and the shared fixture does not; add it to both copies so the hub is forced to say what it thinks of it", mode)
		}
	}
}
