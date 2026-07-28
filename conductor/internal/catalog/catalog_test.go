package catalog

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeFixtures(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	ckad := `{
  "apiVersion": "sim.kubestronaut.dev/v1alpha2",
  "kind": "Exam",
  "metadata": {
    "name": "ckad-mock-01",
    "title": "CKAD Mock Exam 01",
    "certification": "CKAD",
    "description": "Developer-track exercises."
  },
  "spec": {
    "examType": "hands-on",
    "duration": "120m",
    "passingScore": 66,
    "kubernetesVersion": "1.35",
    "instances": [{"name": "instance-1"}, {"name": "instance-2"}],
    "questions": [
      {"id": "q01", "instance": "instance-1", "domain": "D1", "weight": 5},
      {"id": "q02", "instance": "instance-1", "domain": "D2", "weight": 7},
      {"id": "q03", "instance": "instance-2", "domain": "D3", "weight": 5}
    ]
  }
}`
	badInstances := `{
  "metadata": {"name": "weird-bank", "title": "Weird"},
  "spec": {
    "duration": "60m",
    "instances": [{"name": "custom-box"}],
    "questions": [{"id": "q01", "instance": "custom-box"}]
  }
}`
	comingSoon := `{
  "comingSoon": [
    {"id": "kcna-mock", "title": "KCNA Mock Exam", "certification": "KCNA",
     "examType": "mcq", "note": "Multiple-choice engine not built yet"}
  ]
}`
	for name, content := range map[string]string{
		"ckad-mock-01.json": ckad,
		"weird-bank.json":   badInstances,
		"_catalog.json":     comingSoon,
	} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	return dir
}

func TestLoadBuildsEntriesFromBankJSON(t *testing.T) {
	c, err := Load(writeFixtures(t))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	e, ok := c.Get("ckad-mock-01")
	if !ok {
		t.Fatal("ckad-mock-01 missing from catalog")
	}
	if !e.Available {
		t.Error("valid hands-on bank must be Available")
	}
	if e.Title != "CKAD Mock Exam 01" || e.Certification != "CKAD" {
		t.Errorf("entry metadata = %+v", e)
	}
	if e.DurationSeconds != 7200 {
		t.Errorf("DurationSeconds = %d, want 7200", e.DurationSeconds)
	}
	if e.QuestionCount != 3 {
		t.Errorf("QuestionCount = %d, want 3", e.QuestionCount)
	}
	if e.ExamType != "hands-on" {
		t.Errorf("ExamType = %q (empty spec.examType must default to hands-on elsewhere; explicit here)", e.ExamType)
	}
}

// Banks whose instances fall outside the fixed instance-1/instance-2
// topology cannot run on this stack; they must be listed but disabled.
func TestNonConformingInstanceNamesAreUnavailable(t *testing.T) {
	c, err := Load(writeFixtures(t))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	e, ok := c.Get("weird-bank")
	if !ok {
		t.Fatal("weird-bank should still be listed")
	}
	if e.Available {
		t.Error("bank with unknown instance names must not be Available")
	}
	if e.Note == "" {
		t.Error("unavailable bank should say why")
	}
}

func TestComingSoonEntriesAreMergedUnavailable(t *testing.T) {
	c, err := Load(writeFixtures(t))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	e, ok := c.Get("kcna-mock")
	if !ok {
		t.Fatal("coming-soon entry missing")
	}
	if e.Available || !e.ComingSoon {
		t.Errorf("coming-soon entry = %+v, want unavailable+comingSoon", e)
	}

	list := c.List()
	if len(list) != 3 {
		t.Fatalf("List len = %d, want 3", len(list))
	}
}

func TestSwitchableRejectsUnavailableAndUnknown(t *testing.T) {
	c, err := Load(writeFixtures(t))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if err := c.Switchable("ckad-mock-01"); err != nil {
		t.Errorf("Switchable(ckad) = %v, want nil", err)
	}
	if err := c.Switchable("kcna-mock"); err == nil {
		t.Error("Switchable(coming-soon) must error")
	}
	if err := c.Switchable("weird-bank"); err == nil {
		t.Error("Switchable(non-conforming) must error")
	}
	if err := c.Switchable("no-such-bank"); err == nil {
		t.Error("Switchable(unknown) must error")
	}
	if err := c.Switchable("../etc"); err == nil {
		t.Error("Switchable must reject ids failing the slug rule")
	}
}

// A hidden bank is the mechanism that lets tests/smoke.sh keep covering
// the whole bank-switch path now that the CKA bank is gone. It has to be
// invisible in the lobby and simultaneously a legal switch target — if
// either half breaks, the fixture is either an exam candidates can pick
// or a switch test that cannot run.
func TestHiddenBankIsSwitchableButNotListed(t *testing.T) {
	dir := t.TempDir()
	hidden := `{
  "metadata": {"name": "smoke-01", "title": "Smoke Test Bank", "hidden": true},
  "spec": {
    "examType": "hands-on",
    "duration": "120m",
    "instances": [{"name": "instance-1"}],
    "questions": [{"id": "q01", "instance": "instance-1", "domain": "Smoke", "weight": 1}]
  }
}`
	visible := `{
  "metadata": {"name": "ckad-mock-01", "title": "CKAD Mock Exam 01"},
  "spec": {
    "examType": "hands-on",
    "duration": "120m",
    "instances": [{"name": "instance-1"}],
    "questions": [{"id": "q01", "instance": "instance-1", "domain": "D1", "weight": 1}]
  }
}`
	for name, body := range map[string]string{
		"smoke-01.json":     hidden,
		"ckad-mock-01.json": visible,
	} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}

	c, err := Load(dir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	for _, e := range c.List() {
		if e.ID == "smoke-01" {
			t.Error("List returned the hidden fixture bank; it would show in the lobby")
		}
	}
	if len(c.List()) != 1 {
		t.Errorf("len(List()) = %d, want 1 (only the visible bank)", len(c.List()))
	}

	if _, ok := c.Get("smoke-01"); !ok {
		t.Error("Get could not find the hidden bank; the switch path needs it")
	}
	if err := c.Switchable("smoke-01"); err != nil {
		t.Errorf("Switchable(smoke-01) = %v, want nil — a hidden bank must still be a legal target", err)
	}
}

// Hidden must never reach the wire: the UI has no use for it and no
// business learning the fixture exists.
func TestHiddenIsNotSerialised(t *testing.T) {
	e := Entry{ID: "smoke-01", Hidden: true, Available: true}
	raw, err := json.Marshal(e)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if strings.Contains(string(raw), "hidden") || strings.Contains(string(raw), "Hidden") {
		t.Errorf("Entry JSON leaks the hidden flag: %s", raw)
	}
}
