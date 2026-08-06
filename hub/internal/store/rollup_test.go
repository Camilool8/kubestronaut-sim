package store

import (
	"encoding/json"
	"testing"
)

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

const ckadTraining = `{
  "id": "c3", "bank": "ckad-mock-01", "certification": "CKAD",
  "mode": "training", "gradedAt": "2026-01-04T10:00:00Z",
  "percent": 100, "passed": true, "counted": true,
  "domains": [{"domain": "Observability", "earned": 10, "total": 10}]
}`

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

	if sum.TrackCount != 5 {
		t.Errorf("TrackCount = %d, want 5", sum.TrackCount)
	}
	if sum.PassedCount > sum.TrackCount {
		t.Error("'6 of 5' must be unreachable")
	}
}

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

func TestWeakDomainsRankWeakestFirstAndIncludeDrills(t *testing.T) {
	sum := summarize([]json.RawMessage{
		raw(t, ckadPass), raw(t, ckadDrill),
	})
	if len(sum.WeakDomains) != 2 {
		t.Fatalf("weak domains = %+v, want 2", sum.WeakDomains)
	}

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

func TestADomainWorthNoPointsIsNotRanked(t *testing.T) {
	empty := `{"id":"e5","certification":"CKAD","mode":"exam",
	           "gradedAt":"2026-01-06T10:00:00Z","counted":true,
	           "domains":[{"domain":"Skipped","earned":0,"total":0}]}`
	if got := summarize([]json.RawMessage{raw(t, empty)}).WeakDomains; len(got) != 0 {
		t.Errorf("weak domains = %+v, want none", got)
	}
}

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
