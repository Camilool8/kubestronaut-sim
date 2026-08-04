package control

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// An engine that cannot restart a container: the hosted deployment's ssh
// engine, where a Pod has no per-container restart and restartPolicy:
// Never makes killing PID 1 terminal.
type noRestartEngine struct{ fakeEngine }

func (*noRestartEngine) CanRestart() bool { return false }

// The bug these guard against was not that reset and switch failed — it
// was WHERE they failed. Both wipe the instances, and switch also
// rewrites the active bank, several phases before they reach the restart
// that cannot work. A hosted switch stopped with the bank file already
// saying "mcq" while docs-proxy and the facilitator were still serving
// the practical exam: a session that was neither exam and could not be
// put back. Refusing costs nothing; a half-performed switch costs the
// session.

func TestResetIsRefusedBeforeItTouchesAnythingWhenRestartIsUnavailable(t *testing.T) {
	facilitator := healthyFacilitator(t)
	defer facilitator.Close()

	eng := &noRestartEngine{}
	c := newTestController(t, eng, facilitator.URL)

	if _, err := c.StartReset(); !errors.Is(err, ErrRestartUnavailable) {
		t.Fatalf("StartReset error = %v, want ErrRestartUnavailable", err)
	}
	if calls := strings.Join(eng.recorded(), "\n"); calls != "" {
		t.Errorf("a refused reset still touched the engine:\n%s", calls)
	}
	// Not even a failed job record: nothing began, so there is nothing to
	// report as having gone wrong.
	if snap := c.Store.Status(); snap.LastJob != nil {
		t.Errorf("a refused reset started a job: %+v", snap.LastJob)
	}
}

func TestSwitchIsRefusedAndLeavesTheOutgoingBankActive(t *testing.T) {
	facilitator := healthyFacilitator(t)
	defer facilitator.Close()

	eng := &noRestartEngine{}
	c := newTestController(t, eng, facilitator.URL)
	c.Catalog = testCatalogWithMCQ(t)
	c.RestartExtra = []string{"docs-proxy", "facilitator"}
	c.BankFile = filepath.Join(t.TempDir(), "bank")
	if err := os.WriteFile(c.BankFile, []byte("cka-mock-01\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := c.StartSwitch("kcna-mock"); !errors.Is(err, ErrRestartUnavailable) {
		t.Fatalf("StartSwitch error = %v, want ErrRestartUnavailable", err)
	}
	// The exact regression: this file is the runtime source of truth for
	// which exam is live, and the failed switch had already rewritten it.
	got, err := os.ReadFile(c.BankFile)
	if err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(string(got)) != "cka-mock-01" {
		t.Errorf("bank file = %q, want the outgoing bank still active", got)
	}
	if calls := strings.Join(eng.recorded(), "\n"); calls != "" {
		t.Errorf("a refused switch still touched the engine:\n%s", calls)
	}
}

// The guard is scoped to what each job actually needs, not applied to the
// whole engine: an MCQ reset has no cluster rebuild and no instance
// restart, so it stays available in a hosted session.
func TestMCQResetSurvivesAnEngineThatCannotRestart(t *testing.T) {
	facilitator := healthyFacilitator(t)
	defer facilitator.Close()

	eng := &noRestartEngine{}
	c := newTestController(t, eng, facilitator.URL)
	c.Catalog = testCatalogWithMCQ(t)
	c.BankFile = filepath.Join(t.TempDir(), "bank")
	if err := os.WriteFile(c.BankFile, []byte("kcna-mock\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := c.StartReset(); err != nil {
		t.Fatalf("StartReset on an mcq bank = %v, want it to be allowed", err)
	}
	snap := waitIdle(t, c.Store)
	if snap.LastJob == nil || snap.LastJob.Error != "" {
		t.Fatalf("mcq reset job = %+v, want clean completion", snap.LastJob)
	}
}

// A capable engine must be unaffected — the optional interface means an
// Engine that says nothing is assumed able to restart, which is what the
// Docker engine and every other fake in this package rely on.
func TestResetIsUnaffectedOnAnEngineThatCanRestart(t *testing.T) {
	facilitator := healthyFacilitator(t)
	defer facilitator.Close()

	c := newTestController(t, &fakeEngine{}, facilitator.URL)
	if !c.canRestart() {
		t.Fatal("an Engine without CanRestart must be assumed capable")
	}
	if _, err := c.StartReset(); err != nil {
		t.Fatalf("StartReset: %v", err)
	}
}
