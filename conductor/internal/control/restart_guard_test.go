package control

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type noRestartEngine struct{ fakeEngine }

func (*noRestartEngine) CanRestart() bool { return false }

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
