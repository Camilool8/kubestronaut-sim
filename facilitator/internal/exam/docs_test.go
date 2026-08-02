package exam

import (
	"fmt"
	"testing"
)

// docsQuestion renders one spec.questions entry carrying a docs list.
func docsQuestion(id, docs string) string {
	return fmt.Sprintf(`{"id": %q, "domain": "d", "multi": false,
		"options": ["A", "B", "C"], "correct": [0], "docs": [%s]}`, id, docs)
}

// The field itself: a question may name upstream reading, and Load
// carries it through in bank order.
func TestLoadDocs(t *testing.T) {
	e, err := loadMCQDoc(t, `"examType": "mcq",`, docsQuestion("q01",
		`{"label": "Ingress path types", "url": "https://kubernetes.io/docs/concepts/services-networking/ingress/"},
		 {"label": "Liveness and readiness probes", "url": "https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/"}`))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	got := e.Questions[0].Docs
	if len(got) != 2 {
		t.Fatalf("len(Docs) = %d, want 2: %+v", len(got), got)
	}
	if got[0].Label != "Ingress path types" {
		t.Errorf("Docs[0].Label = %q, want the concept's name", got[0].Label)
	}
	if got[0].URL != "https://kubernetes.io/docs/concepts/services-networking/ingress/" {
		t.Errorf("Docs[0].URL = %q, want it verbatim", got[0].URL)
	}
	if got[1].Label != "Liveness and readiness probes" {
		t.Errorf("Docs[1].Label = %q, want bank order preserved", got[1].Label)
	}
}

// The rule that matters most on a study tool: a bad link is dropped and
// the bank still loads. A candidate must never be unable to sit an exam
// because someone mistyped a URL in a footer.
func TestLoadDocsDropsUnusableEntries(t *testing.T) {
	cases := []struct {
		name  string
		entry string
	}{
		{"http", `{"label": "Probes", "url": "http://kubernetes.io/docs/"}`},
		{"no scheme", `{"label": "Probes", "url": "kubernetes.io/docs/"}`},
		{"not a url", `{"label": "Probes", "url": "https://%zz"}`},
		{"no host", `{"label": "Probes", "url": "https:///docs/"}`},
		{"no label", `{"label": "", "url": "https://kubernetes.io/docs/"}`},
		{"no url", `{"label": "Probes", "url": ""}`},
		{"javascript", `{"label": "Probes", "url": "javascript:alert(1)"}`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			e, err := loadMCQDoc(t, `"examType": "mcq",`, docsQuestion("q01", c.entry))
			if err != nil {
				t.Fatalf("Load: %v — a bad docs link must never fail the boot", err)
			}
			if got := e.Questions[0].Docs; got != nil {
				t.Errorf("Docs = %+v, want the entry dropped", got)
			}
		})
	}
}

// A bad entry costs its own link and nothing else: the good ones beside
// it still arrive.
func TestLoadDocsKeepsTheGoodOnesBesideABadOne(t *testing.T) {
	e, err := loadMCQDoc(t, `"examType": "mcq",`, docsQuestion("q01",
		`{"label": "Broken", "url": "ftp://example.com/x"},
		 {"label": "Jobs and CronJobs", "url": "https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/"}`))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	got := e.Questions[0].Docs
	if len(got) != 1 || got[0].Label != "Jobs and CronJobs" {
		t.Fatalf("Docs = %+v, want only the usable entry", got)
	}
}

// The overwhelmingly common case, and the one every shipped bank is in
// today: no docs at all, which must be nil rather than an empty slice —
// the API omits the field on nil, and "declared nothing usable" must
// reach the client as the same absence as "declared nothing".
func TestLoadDocsAbsentIsNil(t *testing.T) {
	e, err := loadMCQDoc(t, `"examType": "mcq",`, mcqQuestion("q01", false, 3, []int{0}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got := e.Questions[0].Docs; got != nil {
		t.Errorf("Docs = %+v, want nil for a question that declares none", got)
	}

	// And a docs key that is present but entirely unusable lands in the
	// same place, not on an empty non-nil slice.
	e, err = loadMCQDoc(t, `"examType": "mcq",`, docsQuestion("q01", `{"label": "x", "url": "nope"}`))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got := e.Questions[0].Docs; got != nil {
		t.Errorf("Docs = %+v, want nil when every entry was dropped", got)
	}
}

// Both engines read the same key. The hands-on fixture proves the load
// happens before the engine switch rather than inside the mcq branch.
func TestLoadDocsOnAHandsOnBank(t *testing.T) {
	e, err := Load(handsOnPoolExamJSON, handsOnPoolBankDir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	// The fixture declares one on q01 and none anywhere else.
	if got := e.Questions[0].Docs; len(got) != 1 || got[0].Label != "Persistent volumes" {
		t.Fatalf("q01 Docs = %+v, want the single declared entry", got)
	}
	for _, q := range e.Questions[1:] {
		if q.Docs != nil {
			t.Errorf("%s Docs = %+v, want nil", q.ID, q.Docs)
		}
	}
}
