package store

import (
	"encoding/json"
	"testing"
)

// attempts are written as JSON text, not as a struct literal, because
// that is what the store actually holds: bytes the facilitator produced.
// A struct literal here would only prove this file agrees with itself.
func raw(t *testing.T, body string) json.RawMessage {
	t.Helper()
	if !json.Valid([]byte(body)) {
		t.Fatalf("test fixture is not JSON: %s", body)
	}
	return json.RawMessage(body)
}

const ckadPass = `{
  "id": "a1", "bank": "ckad-mock-01", "certification": "CKAD",
  "mode": "exam", "gradedAt": "2026-01-02T10:00:00Z",
  "percent": 80, "passed": true, "counted": true,
  "domains": [
    {"domain": "Application Design", "earned": 8, "total": 10},
    {"domain": "Observability", "earned": 2, "total": 10}
  ]
}`

const kcnaPass = `{
  "id": "b2", "bank": "kcna-mock", "certification": "KCNA",
  "mode": "exam", "gradedAt": "2026-01-03T10:00:00Z",
  "percent": 90, "passed": true, "counted": true,
  "domains": [{"domain": "Kubernetes Fundamentals", "earned": 9, "total": 10}]
}`

// Training is graded and shown, and it is not a sitting: the candidate
// can read the solutions while they work.
const ckadTraining = `{
  "id": "c3", "bank": "ckad-mock-01", "certification": "CKAD",
  "mode": "training", "gradedAt": "2026-01-04T10:00:00Z",
  "percent": 100, "passed": true, "counted": true,
  "domains": [{"domain": "Observability", "earned": 10, "total": 10}]
}`

// A drill over one domain. 100% here is a good session and not a pass.
const ckadDrill = `{
  "id": "d4", "bank": "ckad-mock-01", "certification": "CKAD",
  "mode": "exam", "domainFilter": ["Observability"],
  "gradedAt": "2026-01-05T10:00:00Z",
  "percent": 100, "passed": true, "counted": true,
  "domains": [{"domain": "Observability", "earned": 10, "total": 10}]
}`

func TestSummaryCountsOnlyTrackCertificationsThatActuallyCount(t *testing.T) {
	sum := summarize([]json.RawMessage{
		raw(t, ckadPass), raw(t, kcnaPass), raw(t, ckadTraining), raw(t, ckadDrill),
	})
	if sum.Attempts != 4 {
		t.Errorf("Attempts = %d, want 4 — every graded attempt is one", sum.Attempts)
	}
	if sum.PassedCount != 2 {
		t.Errorf("PassedCount = %d, want 2 (CKAD and KCNA)", sum.PassedCount)
	}
	// The denominator is the program, not the banks a deployment ships.
	if sum.TrackCount != 5 {
		t.Errorf("TrackCount = %d, want 5", sum.TrackCount)
	}
	if sum.PassedCount > sum.TrackCount {
		t.Error("'6 of 5' must be unreachable")
	}
}

// Neither a training run nor a domain drill is a sitting, and each is
// excluded by a different clause. Asserted separately because a rollup
// that dropped one of the two clauses would still pass a test that only
// used the other.
func TestNeitherTrainingNorADrillCanPassACertification(t *testing.T) {
	for name, only := range map[string]string{
		"training": ckadTraining,
		"drill":    ckadDrill,
	} {
		t.Run(name, func(t *testing.T) {
			if got := summarize([]json.RawMessage{raw(t, only)}).PassedCount; got != 0 {
				t.Errorf("PassedCount = %d, want 0", got)
			}
		})
	}
}

// A certification outside the Kubestronaut path can be attempted and
// passed; it must not move the path figure.
func TestAPassOutsideTheTrackDoesNotCount(t *testing.T) {
	off := `{"id":"z9","bank":"other","certification":"CKX","mode":"exam",
	         "gradedAt":"2026-02-01T10:00:00Z","percent":95,"passed":true,"counted":true,
	         "domains":[{"domain":"Whatever","earned":9,"total":10}]}`
	sum := summarize([]json.RawMessage{raw(t, off)})
	if sum.PassedCount != 0 {
		t.Errorf("PassedCount = %d, want 0", sum.PassedCount)
	}
	if sum.Attempts != 1 {
		t.Errorf("Attempts = %d, want 1 — it still happened", sum.Attempts)
	}
}

// Weakest first, across every attempt including the ones that do not
// count. A rollup that ignored drills would keep reporting the weakness
// the candidate spent all week fixing.
func TestWeakDomainsRankWeakestFirstAndIncludeDrills(t *testing.T) {
	sum := summarize([]json.RawMessage{
		raw(t, ckadPass), raw(t, ckadDrill),
	})
	if len(sum.WeakDomains) != 2 {
		t.Fatalf("weak domains = %+v, want 2", sum.WeakDomains)
	}
	// Observability: 2/10 from the exam plus 10/10 from the drill = 60%.
	// Application Design: 8/10 = 80%. So Observability ranks first, and
	// it ranks first only because the drill was included.
	if sum.WeakDomains[0].Domain != "Observability" {
		t.Errorf("weakest = %q, want Observability", sum.WeakDomains[0].Domain)
	}
	if sum.WeakDomains[0].Percent != 60 {
		t.Errorf("Observability = %d%%, want 60 — the drill was not rolled in", sum.WeakDomains[0].Percent)
	}
	if sum.WeakDomains[0].Attempts != 2 {
		t.Errorf("Observability attempts = %d, want 2", sum.WeakDomains[0].Attempts)
	}
	if sum.WeakDomains[1].Domain != "Application Design" {
		t.Errorf("second = %q", sum.WeakDomains[1].Domain)
	}
}

// A domain worth no points is an authoring artefact — every check
// skipped — not a candidate scoring zero.
func TestADomainWorthNoPointsIsNotRanked(t *testing.T) {
	empty := `{"id":"e5","certification":"CKAD","mode":"exam",
	           "gradedAt":"2026-01-06T10:00:00Z","counted":true,
	           "domains":[{"domain":"Skipped","earned":0,"total":0}]}`
	if got := summarize([]json.RawMessage{raw(t, empty)}).WeakDomains; len(got) != 0 {
		t.Errorf("weak domains = %+v, want none", got)
	}
}

// Never null. The UI maps over this array without checking.
func TestWeakDomainsMarshalAsAnArrayWhenThereAreNone(t *testing.T) {
	b, err := json.Marshal(summarize(nil))
	if err != nil {
		t.Fatal(err)
	}
	var out map[string]any
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatal(err)
	}
	if _, ok := out["weakDomains"].([]any); !ok {
		t.Errorf("weakDomains = %v, want []", out["weakDomains"])
	}
}

// One record written by a build this one has never met must not cost the
// candidate the rest of their history.
func TestARecordThatWillNotDecodeIsCountedAndSkipped(t *testing.T) {
	sum := summarize([]json.RawMessage{
		raw(t, ckadPass), json.RawMessage(`"not an object"`),
	})
	if sum.Attempts != 2 {
		t.Errorf("Attempts = %d, want 2 — it is still an attempt", sum.Attempts)
	}
	if sum.PassedCount != 1 {
		t.Errorf("PassedCount = %d, want 1 — the readable record still counts", sum.PassedCount)
	}
}
