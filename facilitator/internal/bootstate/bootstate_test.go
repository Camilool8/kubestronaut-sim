package bootstate

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// newTestReader returns a Reader over a temp dir plus the two paths, with
// caching disabled so each test sees the disk it just wrote.
func newTestReader(t *testing.T) (*Reader, string, string) {
	t.Helper()
	dir := t.TempDir()
	bootFile := filepath.Join(dir, "boot.json")
	marker := filepath.Join(dir, "ready")

	r := New(bootFile, marker)
	// Each Read gets a fresh "now" far enough ahead to defeat the 1s
	// coalescing window; the cache is an optimisation, not behaviour
	// under test.
	base := time.Unix(0, 0)
	var n int
	r.now = func() time.Time {
		n++
		return base.Add(time.Duration(n) * time.Hour)
	}
	return r, bootFile, marker
}

func write(t *testing.T, path, body string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

// The first seconds of every boot, and every environment built before
// phase reporting existed. Must degrade to something renderable rather
// than to an error.
func TestNoFilesAtAllReportsBooting(t *testing.T) {
	r, _, _ := newTestReader(t)

	got := r.Read()
	if got.State != StateBooting {
		t.Errorf("State = %q, want %q", got.State, StateBooting)
	}
	if got.Label == "" {
		t.Error("Label is empty; the progress screen would render a blank")
	}
	if got.Ready() {
		t.Error("Ready() = true with no ready marker")
	}
}

// A bank whose bootstrap predates phase reporting writes the marker and
// nothing else. That environment is usable and must be reported so.
func TestReadyMarkerAloneIsReady(t *testing.T) {
	r, _, marker := newTestReader(t)
	write(t, marker, "")

	got := r.Read()
	if !got.Ready() {
		t.Errorf("State = %q, want ready from the marker alone", got.State)
	}
}

func TestPhaseFileIsReportedWhileBooting(t *testing.T) {
	r, bootFile, _ := newTestReader(t)
	write(t, bootFile, `{"version":1,"state":"booting","phase":"seed",
	  "label":"Setting up the exam questions","detail":"question 7 of 22",
	  "step":7,"totalSteps":8,"startedAt":"2026-07-27T10:00:00Z"}`)

	got := r.Read()
	if got.State != StateBooting {
		t.Fatalf("State = %q, want %q", got.State, StateBooting)
	}
	if got.Phase != "seed" || got.Step != 7 || got.TotalSteps != 8 {
		t.Errorf("got phase=%q step=%d/%d, want seed 7/8", got.Phase, got.Step, got.TotalSteps)
	}
	if got.Detail != "question 7 of 22" {
		t.Errorf("Detail = %q, want the sub-phase line", got.Detail)
	}
}

// The direction that actually bites: bootstrap.sh removes the ready
// marker at the start of every run, so during a reset the phase file
// still says "ready" from the previous boot. Believing it would show a
// finished environment that is mid-rebuild.
func TestStaleReadyPhaseFileIsDowngradedWithoutTheMarker(t *testing.T) {
	r, bootFile, _ := newTestReader(t)
	write(t, bootFile, `{"version":1,"state":"ready","phase":"ready","label":"Environment ready","step":8,"totalSteps":8}`)

	got := r.Read()
	if got.State != StateBooting {
		t.Errorf("State = %q, want %q — the marker is gone, so the file is stale", got.State, StateBooting)
	}
}

// And the other direction: a boot that completed between the phase
// file's last write and this read is ready, whatever the file says.
func TestMarkerWinsOverALaggingPhaseFile(t *testing.T) {
	r, bootFile, marker := newTestReader(t)
	write(t, bootFile, `{"version":1,"state":"booting","phase":"seed","label":"Setting up the exam questions"}`)
	write(t, marker, "")

	got := r.Read()
	if !got.Ready() {
		t.Errorf("State = %q, want ready — the marker is the authority", got.State)
	}
}

// A failed boot must survive as an error the UI can render, not decay
// into a generic "still working".
func TestFailedStateIsPreserved(t *testing.T) {
	r, bootFile, _ := newTestReader(t)
	write(t, bootFile, `{"version":1,"state":"failed","phase":"cni","label":"Installing the pod network","error":"step failed: kubectl apply -f /opt/sim/calico.yaml (exit 1)"}`)

	got := r.Read()
	if got.State != StateFailed {
		t.Fatalf("State = %q, want %q", got.State, StateFailed)
	}
	if got.Error == "" {
		t.Error("Error is empty; the failure screen has nothing to show")
	}
}

// A ready environment must not keep reporting a stale failure from the
// boot before the one that fixed it.
func TestMarkerClearsAStaleFailure(t *testing.T) {
	r, bootFile, marker := newTestReader(t)
	write(t, bootFile, `{"version":1,"state":"failed","phase":"cni","error":"boom"}`)
	write(t, marker, "")

	got := r.Read()
	if !got.Ready() {
		t.Fatalf("State = %q, want ready", got.State)
	}
	if got.Error != "" {
		t.Errorf("Error = %q, want it cleared once the marker exists", got.Error)
	}
}

// A torn read is the whole reason phase.sh writes atomically; if one
// ever does slip through, it must not take the endpoint down.
func TestMalformedPhaseFileDegradesToBooting(t *testing.T) {
	r, bootFile, _ := newTestReader(t)
	write(t, bootFile, `{"version":1,"state":"boot`)

	got := r.Read()
	if got.State != StateBooting {
		t.Errorf("State = %q, want %q", got.State, StateBooting)
	}
	if got.Label == "" {
		t.Error("Label is empty")
	}
}

func TestEmptyStateFieldDegradesToBooting(t *testing.T) {
	r, bootFile, _ := newTestReader(t)
	write(t, bootFile, `{"version":1}`)

	if got := r.Read(); got.State != StateBooting {
		t.Errorf("State = %q, want %q", got.State, StateBooting)
	}
}

func TestReadIsCachedWithinTheTTL(t *testing.T) {
	dir := t.TempDir()
	bootFile := filepath.Join(dir, "boot.json")
	r := New(bootFile, filepath.Join(dir, "ready"))
	frozen := time.Unix(1000, 0)
	r.now = func() time.Time { return frozen }

	write(t, bootFile, `{"version":1,"state":"booting","phase":"cni","label":"first"}`)
	if got := r.Read(); got.Label != "first" {
		t.Fatalf("Label = %q, want first", got.Label)
	}

	write(t, bootFile, `{"version":1,"state":"booting","phase":"seed","label":"second"}`)
	if got := r.Read(); got.Label != "first" {
		t.Errorf("Label = %q, want the cached first within the TTL", got.Label)
	}
}
