package control

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kubestronaut-sim/conductor/internal/catalog"
)

func reseedFixture(t *testing.T, eng Engine, mode string) *Controller {
	t.Helper()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		state := "running"
		if mode == "" {
			state = "idle"
		}
		json.NewEncoder(w).Encode(map[string]string{"state": state, "mode": mode})
	}))
	t.Cleanup(srv.Close)

	dir := t.TempDir()
	bankFile := filepath.Join(dir, "bank")
	if err := os.WriteFile(bankFile, []byte("ckad-mock-01\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	catDir := t.TempDir()
	doc := `{
  "metadata": {"name": "ckad-mock-01", "title": "CKAD"},
  "spec": {
    "examType": "hands-on", "duration": "120m",
    "instances": [{"name": "instance-1"}],
    "questions": [{"id": "q07", "instance": "instance-1", "domain": "D", "weight": 1}]
  }
}`
	if err := os.WriteFile(filepath.Join(catDir, "ckad-mock-01.json"), []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}
	cat, err := catalog.Load(catDir)
	if err != nil {
		t.Fatal(err)
	}

	c := newTestController(t, eng, srv.URL)
	c.BankFile = bankFile
	c.Catalog = cat
	return c
}

func TestReseedRunsTheQuestionsSetup(t *testing.T) {
	eng := &fakeEngine{}
	c := reseedFixture(t, eng, "training")

	if err := c.Reseed(context.Background(), "q07"); err != nil {
		t.Fatalf("Reseed: %v", err)
	}

	var got string
	for _, call := range eng.recorded() {
		if strings.HasPrefix(call, "exec:k8s-env:") {
			got = call
		}
	}
	want := "exec:k8s-env:bash -c bash /banks/ckad-mock-01/q07/setup.sh"
	if got != want {
		t.Errorf("exec = %q, want %q", got, want)
	}
}

func TestReseedRejectsAnythingNotInTheBank(t *testing.T) {
	for _, qid := range []string{
		"../../etc/passwd",
		"q07; rm -rf /",
		"q07 && curl evil",
		"$(whoami)",
		"q99",
		"Q07",
		"q0007",
		"",
	} {
		t.Run(qid, func(t *testing.T) {
			eng := &fakeEngine{}
			c := reseedFixture(t, eng, "training")

			err := c.Reseed(context.Background(), qid)
			if !errors.Is(err, ErrUnknownQuestion) {
				t.Fatalf("Reseed(%q) = %v, want ErrUnknownQuestion", qid, err)
			}
			for _, call := range eng.recorded() {
				if strings.HasPrefix(call, "exec:") {
					t.Fatalf("a rejected id still reached the engine: %q", call)
				}
			}
		})
	}
}

func TestReseedRefusedForMCQBank(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"state": "running", "mode": "training"})
	}))
	t.Cleanup(srv.Close)

	dir := t.TempDir()
	bankFile := filepath.Join(dir, "bank")
	if err := os.WriteFile(bankFile, []byte("kcna-mock\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	catDir := t.TempDir()
	doc := `{
  "metadata": {"name": "kcna-mock", "title": "KCNA"},
  "spec": {
    "examType": "mcq", "duration": "90m",
    "questions": [{"id": "q07", "domain": "D", "options": ["a", "b", "c"], "correct": [0]}]
  }
}`
	if err := os.WriteFile(filepath.Join(catDir, "kcna-mock.json"), []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}
	cat, err := catalog.Load(catDir)
	if err != nil {
		t.Fatal(err)
	}

	eng := &fakeEngine{}
	c := newTestController(t, eng, srv.URL)
	c.BankFile = bankFile
	c.Catalog = cat

	if err := c.Reseed(context.Background(), "q07"); !errors.Is(err, ErrNoReseed) {
		t.Fatalf("Reseed on an mcq bank = %v, want ErrNoReseed", err)
	}
	for _, call := range eng.recorded() {
		if strings.HasPrefix(call, "exec:") {
			t.Fatalf("an mcq reseed still reached the engine: %q", call)
		}
	}
}

func TestReseedRefusedOutsideTraining(t *testing.T) {
	for _, mode := range []string{"exam", "speed", ""} {
		t.Run("mode="+mode, func(t *testing.T) {
			eng := &fakeEngine{}
			c := reseedFixture(t, eng, mode)

			if err := c.Reseed(context.Background(), "q07"); !errors.Is(err, ErrNotTraining) {
				t.Fatalf("Reseed = %v, want ErrNotTraining", err)
			}
			for _, call := range eng.recorded() {
				if strings.HasPrefix(call, "exec:") {
					t.Fatalf("setup.sh ran outside training: %q", call)
				}
			}
		})
	}
}

func TestReseedDefersToARunningJob(t *testing.T) {
	eng := &fakeEngine{}
	c := reseedFixture(t, eng, "training")

	if _, err := c.Store.Begin("reset", "", nil); err != nil {
		t.Fatalf("Begin: %v", err)
	}

	err := c.Reseed(context.Background(), "q07")
	if err == nil {
		t.Fatal("Reseed succeeded while a job was in flight")
	}
	for _, call := range eng.recorded() {
		if strings.HasPrefix(call, "exec:") {
			t.Fatalf("setup.sh ran during a rebuild: %q", call)
		}
	}
}
