package catalog

import (
	"os"
	"path/filepath"
	"testing"
)

// writeIndex builds the directory the banks image stages: one JSON
// document per bank, named for its directory, exactly as the image's
// index stage emits them.
func writeIndex(t *testing.T, files map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	for name, body := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	return dir
}

const ckad = `{
  "metadata": {"name": "ckad-mock-01", "title": "CKAD Mock Exam 01", "certification": "CKAD",
               "description": "Twenty-two hands-on tasks."},
  "spec": {"examType": "hands-on", "duration": "120m", "passingScore": 66,
           "kubernetesVersion": "1.35",
           "instances": [{"name": "instance-1"}, {"name": "instance-2"}],
           "questions": [{"id": "q01"}, {"id": "q02"}, {"id": "q03"}]}
}`

const kcna = `{
  "metadata": {"name": "kcna-mock", "title": "KCNA Mock Exam", "certification": "KCNA"},
  "spec": {"examType": "mcq", "duration": "90m", "passingScore": 75, "examLength": 2,
           "questions": [{"id": "q01"}, {"id": "q02"}, {"id": "q03"}, {"id": "q04"}]}
}`

func entryByID(t *testing.T, c *Catalog, id string) Entry {
	t.Helper()
	e, ok := c.Get(id)
	if !ok {
		t.Fatalf("%s missing from the catalog", id)
	}
	return e
}

func TestLoadReadsEveryBank(t *testing.T) {
	c, err := Load(writeIndex(t, map[string]string{
		"ckad-mock-01.json": ckad,
		"kcna-mock.json":    kcna,
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	ck := entryByID(t, c, "ckad-mock-01")
	if !ck.Available || ck.Certification != "CKAD" || ck.ExamType != "hands-on" {
		t.Errorf("ckad = %+v, want an available hands-on CKAD entry", ck)
	}
	if ck.DurationSeconds != 7200 {
		t.Errorf("DurationSeconds = %d, want 7200", ck.DurationSeconds)
	}
	// Not pooled: both counts are the authored pool, and the card must
	// not print "3 / 3" as though a draw were happening.
	if ck.QuestionCount != 3 || ck.PoolCount != 3 {
		t.Errorf("counts = %d/%d, want 3/3", ck.QuestionCount, ck.PoolCount)
	}

	// Pooled: the card shows the draw size, never the pool behind it.
	kc := entryByID(t, c, "kcna-mock")
	if kc.QuestionCount != 2 || kc.PoolCount != 4 {
		t.Errorf("kcna counts = %d/%d, want 2/4", kc.QuestionCount, kc.PoolCount)
	}
}

// A bank that cannot be sat is listed and explained, not dropped. A
// candidate who can see that CKS exists and why it is not ready has
// learnt something; a card that silently vanished has not.
func TestUnrunnableBanksAreListedWithTheReason(t *testing.T) {
	c, err := Load(writeIndex(t, map[string]string{
		// Outside the fixed two-instance topology every session has.
		"odd-mock.json": `{"metadata":{"name":"odd-mock","title":"Odd"},
		  "spec":{"examType":"hands-on","duration":"60m",
		          "instances":[{"name":"instance-9"}],"questions":[{"id":"q01"}]}}`,
		// An engine that does not exist.
		"weird-mock.json": `{"metadata":{"name":"weird-mock","title":"Weird"},
		  "spec":{"examType":"oral","duration":"60m","questions":[{"id":"q01"}]}}`,
		// mcq banks grade in the facilitator and have no shells at all.
		"chatty-mock.json": `{"metadata":{"name":"chatty-mock","title":"Chatty"},
		  "spec":{"examType":"mcq","duration":"60m",
		          "instances":[{"name":"instance-1"}],"questions":[{"id":"q01"}]}}`,
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	for _, id := range []string{"odd-mock", "weird-mock", "chatty-mock"} {
		e := entryByID(t, c, id)
		if e.Available {
			t.Errorf("%s is available, want refused", id)
		}
		if e.Note == "" {
			t.Errorf("%s is unavailable with no reason given", id)
		}
	}
}

// One broken bank must not take the front door of the deployment down
// with it: this runs at hub startup, before anyone can sign in.
func TestOneBrokenBankDoesNotFailTheLoad(t *testing.T) {
	c, err := Load(writeIndex(t, map[string]string{
		"ckad-mock-01.json": ckad,
		"broken.json":       `{"metadata": {`,
		// metadata.name disagreeing with the directory is how a copied
		// bank ends up shadowing the one it was copied from.
		"misnamed.json": `{"metadata":{"name":"something-else","title":"X"},"spec":{"duration":"1m"}}`,
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if _, ok := c.Get("ckad-mock-01"); !ok {
		t.Error("the good bank was lost with the bad ones")
	}
	for _, id := range []string{"broken", "misnamed"} {
		if _, ok := c.Get(id); ok {
			t.Errorf("%s was loaded, want skipped", id)
		}
	}
}

// The coming-soon list is how a certification on the path appears before
// its bank exists — and it must never shadow the real thing once it does.
func TestComingSoonFillsGapsButNeverShadowsARealBank(t *testing.T) {
	c, err := Load(writeIndex(t, map[string]string{
		"ckad-mock-01.json": ckad,
		"_catalog.json": `{"comingSoon":[
		  {"id":"cks-mock","title":"CKS Mock Exam","certification":"CKS","examType":"hands-on",
		   "note":"Needs security add-ons the environment has not got"},
		  {"id":"ckad-mock-01","title":"STALE","certification":"NOPE","examType":"mcq"}]}`,
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	cks := entryByID(t, c, "cks-mock")
	if cks.Available || !cks.ComingSoon || cks.Note == "" {
		t.Errorf("cks = %+v, want an unavailable coming-soon entry with a note", cks)
	}
	if got := entryByID(t, c, "ckad-mock-01"); got.Title == "STALE" {
		t.Error("a stale coming-soon entry shadowed the real bank")
	}
}

// Hidden keeps the smoke fixture out of the lobby without making it
// unstartable by name — the same split the conductor's catalog draws.
func TestHiddenBanksAreNotOfferedButAreStillFound(t *testing.T) {
	c, err := Load(writeIndex(t, map[string]string{
		"ckad-mock-01.json": ckad,
		"smoke-01.json": `{"metadata":{"name":"smoke-01","title":"Smoke","hidden":true},
		  "spec":{"examType":"hands-on","duration":"120m",
		          "instances":[{"name":"instance-1"}],"questions":[{"id":"q01"}]}}`,
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	for _, e := range c.List() {
		if e.ID == "smoke-01" {
			t.Error("the hidden fixture is offered in the lobby")
		}
	}
	if _, ok := c.Get("smoke-01"); !ok {
		t.Error("the hidden fixture cannot be found by name")
	}
}

// A deployment that staged no index is a hub that serves identity,
// history and its running sessions. It is not a failure to start.
func TestNoIndexIsAnEmptyCatalogNotAnError(t *testing.T) {
	for _, dir := range []string{"", filepath.Join(t.TempDir(), "absent")} {
		c, err := Load(dir)
		if err != nil {
			t.Fatalf("Load(%q): %v", dir, err)
		}
		if c.Len() != 0 || len(c.List()) != 0 {
			t.Errorf("Load(%q) found %d entries, want none", dir, c.Len())
		}
	}
}
