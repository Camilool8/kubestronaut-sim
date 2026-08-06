package history

import (
	"testing"
	"time"
)

func TestCounted(t *testing.T) {
	cases := []struct {
		name          string
		mode          string
		domainFilter  []string
		questionCount int
		declared      int
		want          bool
	}{
		{"a full exam attempt counts", "exam", nil, 22, 22, true},
		{"a full speed attempt counts", "speed", nil, 22, 22, true},
		{"training never counts", "training", nil, 22, 22, false},
		{"a domain-filtered draw does not", "exam", []string{"Storage"}, 22, 22, false},
		{"a short draw does not", "exam", nil, 10, 22, false},
		{"a full pooled draw counts", "exam", nil, 65, 65, true},
		{"a pooled draw short of its length does not", "exam", nil, 40, 65, false},
		{"more questions than declared still counts", "exam", nil, 23, 22, true},
		{"an unknown declared length disables only that clause", "exam", nil, 3, 0, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := Counted(tc.mode, tc.domainFilter, tc.questionCount, tc.declared)
			if got != tc.want {
				t.Errorf("Counted(%q, %v, %d, %d) = %v, want %v",
					tc.mode, tc.domainFilter, tc.questionCount, tc.declared, got, tc.want)
			}
		})
	}
}

func withDomains(r Record, domains ...DomainResult) Record {
	r.Domains = domains
	return r
}

func TestProgressUsesOnlyCountedAttemptsForBestAndPassed(t *testing.T) {
	records := []Record{
		rec("full", "ckad-mock-01", "CKAD", epoch, 62),
		func() Record {

			d := rec("drill", "ckad-mock-01", "CKAD", epoch.Add(time.Hour), 100)
			d.Counted = false
			d.DomainFilter = []string{"Storage"}
			return d
		}(),
	}
	p := Progress(records)

	if p.Attempts != 2 || p.Counted != 1 {
		t.Errorf("Progress = %d attempts / %d counted, want 2/1", p.Attempts, p.Counted)
	}
	if p.BestPercent == nil || *p.BestPercent != 62 {
		t.Errorf("BestPercent = %v, want 62 — the drill must not set it", p.BestPercent)
	}
	if p.Passed {
		t.Error("Passed = true; a 100% single-domain drill must not light up the certification")
	}

	if p.LastAttemptAt != epoch.Add(time.Hour).Format(time.RFC3339) {
		t.Errorf("LastAttemptAt = %q, want the drill's timestamp", p.LastAttemptAt)
	}
}

func TestProgressWithNoCountedAttemptsHasNoBest(t *testing.T) {
	r := rec("drill", "b", "CKAD", epoch, 100)
	r.Counted = false
	p := Progress([]Record{r})

	if p.BestPercent != nil {
		t.Errorf("BestPercent = %v, want absent — 0%% is a score, never-sat is not", *p.BestPercent)
	}
	if p.WeakDomains == nil {
		t.Error("WeakDomains is nil; it must marshal as an array")
	}
}

func TestWeakDomainsRankWeakestFirstAcrossAttempts(t *testing.T) {
	records := []Record{
		withDomains(rec("a1", "b", "CKAD", epoch, 60),
			DomainResult{Domain: "Storage", Earned: 2, Total: 10},
			DomainResult{Domain: "Design", Earned: 9, Total: 10},
		),
		withDomains(rec("a2", "b", "CKAD", epoch.Add(time.Hour), 70),
			DomainResult{Domain: "Storage", Earned: 4, Total: 10},
			DomainResult{Domain: "Observability", Earned: 0, Total: 0},
		),
	}
	got := weakDomains(records)

	if len(got) != 2 {
		t.Fatalf("weakDomains = %#v, want 2 (a zero-total domain is not a weakness)", got)
	}
	if got[0].Domain != "Storage" || got[0].Earned != 6 || got[0].Total != 20 || got[0].Percent != 30 {
		t.Errorf("weakest = %#v, want Storage 6/20 = 30%%", got[0])
	}
	if got[0].Attempts != 2 {
		t.Errorf("Storage attempts = %d, want 2", got[0].Attempts)
	}
	if got[1].Domain != "Design" {
		t.Errorf("second = %q, want Design", got[1].Domain)
	}
}

func TestWeakDomainsIncludeUncountedAttempts(t *testing.T) {
	drill := withDomains(rec("drill", "b", "CKAD", epoch, 100),
		DomainResult{Domain: "Storage", Earned: 10, Total: 10})
	drill.Counted = false

	got := weakDomains([]Record{drill})
	if len(got) != 1 || got[0].Percent != 100 {
		t.Fatalf("weakDomains = %#v, want the drill's Storage rollup", got)
	}
}

func TestSummarize(t *testing.T) {
	uncounted := func(r Record) Record { r.Counted = false; return r }
	records := []Record{
		rec("a1", "ckad-mock-01", "CKAD", epoch, 90),
		rec("a2", "ckad-mock-01", "CKAD", epoch.Add(time.Hour), 91),
		rec("a3", "kcna-mock", "KCNA", epoch.Add(2*time.Hour), 88),
		rec("a4", "cks-mock", "CKS", epoch.Add(3*time.Hour), 10),
		uncounted(rec("a5", "kcsa-mock", "KCSA", epoch.Add(4*time.Hour), 99)),
		rec("a6", "smoke-01", "", epoch.Add(5*time.Hour), 100),
		rec("a7", "other-mock", "SOMETHING", epoch.Add(6*time.Hour), 95),
	}
	sum := Summarize(records)

	if sum.Attempts != 7 {
		t.Errorf("Attempts = %d, want 7", sum.Attempts)
	}
	if sum.TrackCount != 5 {
		t.Errorf("TrackCount = %d, want 5 — the Kubestronaut path, not the banks that happen to exist", sum.TrackCount)
	}

	if sum.PassedCount != 2 {
		t.Errorf("PassedCount = %d, want 2", sum.PassedCount)
	}
	if sum.PassedCount > sum.TrackCount {
		t.Error("PassedCount exceeded TrackCount; '6 of 5' must be unreachable")
	}
}

func TestProgressByBankKeysOnTheBankID(t *testing.T) {
	s, _ := Open(tempPath(t))
	s.Add(rec("a1", "ckad-mock-01", "CKAD", epoch, 70))
	s.Add(rec("a2", "kcna-mock", "KCNA", epoch.Add(time.Hour), 80))

	byBank := s.ProgressByBank()
	if len(byBank) != 2 {
		t.Fatalf("ProgressByBank = %#v, want 2 banks", byBank)
	}
	if p := byBank["ckad-mock-01"]; p.BestPercent == nil || *p.BestPercent != 70 {
		t.Errorf("ckad-mock-01 best = %v, want 70", p.BestPercent)
	}
	if p := byBank["kcna-mock"]; p.BestPercent == nil || *p.BestPercent != 80 {
		t.Errorf("kcna-mock best = %v, want 80", p.BestPercent)
	}
}

func TestCheckDocument(t *testing.T) {
	if err := CheckDocument(Document{Version: 0}); err != nil {
		t.Errorf("version 0 rejected: %v", err)
	}
	if err := CheckDocument(Document{Version: documentVersion}); err != nil {
		t.Errorf("current version rejected: %v", err)
	}
	if err := CheckDocument(Document{Version: documentVersion + 1}); err == nil {
		t.Error("a future version was accepted; merging a shape this build cannot read drops fields silently")
	}
}

func TestRollupsDistrustAnImportedCountedFlag(t *testing.T) {
	training := rec("a1", "b", "CKAD", epoch, 100)
	training.Mode = "training"
	training.Counted = true

	filtered := rec("a2", "b", "CKAD", epoch.Add(time.Hour), 100)
	filtered.DomainFilter = []string{"Storage"}
	filtered.Counted = true

	records := []Record{training, filtered}
	p := Progress(records)
	if p.Counted != 0 || p.BestPercent != nil || p.Passed {
		t.Errorf("Progress = %+v, want nothing counted", p)
	}
	if got := Summarize(records).PassedCount; got != 0 {
		t.Errorf("PassedCount = %d, want 0", got)
	}
}
