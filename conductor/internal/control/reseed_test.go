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

// reseedFixture wires a controller over a bank file, a one-question
// catalog, and a facilitator stub reporting the given session mode.
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

// The question id arrives from the browser and ends up inside a shell
// command. Both gates — the pattern and the catalog allowlist — have to
// hold, and neither may let anything reach the engine.
func TestReseedRejectsAnythingNotInTheBank(t *testing.T) {
	for _, qid := range []string{
		"../../etc/passwd",
		"q07; rm -rf /",
		"q07 && curl evil",
		"$(whoami)",
		"q99",     // well-formed, but not in this bank
		"Q07",     // wrong case
		"q0007",   // too long
		"",        // empty
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

// Re-running setup.sh destroys that question's work. Fine while
// practising; hostile during an exam.
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

// A reset is rebuilding the very cluster this would seed into, so the
// re-seed defers rather than racing it.
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
