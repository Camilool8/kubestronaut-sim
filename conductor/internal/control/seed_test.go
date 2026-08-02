package control

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"kubestronaut-sim/conductor/internal/catalog"
	"kubestronaut-sim/conductor/internal/job"
)

// seedFixture wires a controller over a four-question hands-on bank (or
// an mcq one), a bank file, and a facilitator stub reporting the given
// session state.
func seedFixture(t *testing.T, eng Engine, state, examType string) *Controller {
	t.Helper()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"state": state, "mode": "exam"})
	}))
	t.Cleanup(srv.Close)

	dir := t.TempDir()
	bankFile := filepath.Join(dir, "bank")
	if err := os.WriteFile(bankFile, []byte("pool-bank\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	questions := `[
      {"id": "q01", "instance": "instance-1", "domain": "D", "weight": 1},
      {"id": "q02", "instance": "instance-1", "domain": "D", "weight": 1},
      {"id": "q03", "instance": "instance-1", "domain": "D", "weight": 1},
      {"id": "q04", "instance": "instance-1", "domain": "D", "weight": 1}
    ]`
	instances := `[{"name": "instance-1"}]`
	if examType == "mcq" {
		instances = `[]`
	}
	doc := `{
  "metadata": {"name": "pool-bank", "title": "Pool Bank"},
  "spec": {
    "examType": "` + examType + `", "duration": "60m", "examLength": 2,
    "instances": ` + instances + `,
    "questions": ` + questions + `
  }
}`
	catDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(catDir, "pool-bank.json"), []byte(doc), 0o644); err != nil {
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

// execs returns the k8s-env exec commands the engine was given, in
// order.
func execs(eng *fakeEngine) []string {
	var out []string
	for _, call := range eng.recorded() {
		if strings.HasPrefix(call, "exec:k8s-env:") {
			out = append(out, call)
		}
	}
	return out
}

// The core of it: one setup.sh per drawn question, in the order the draw
// produced them, and the job completes.
func TestStartSeedRunsEachQuestionsSetupInDrawOrder(t *testing.T) {
	eng := &fakeEngine{}
	c := seedFixture(t, eng, "idle", "hands-on")

	j, err := c.StartSeed([]string{"q03", "q01"})
	if err != nil {
		t.Fatalf("StartSeed: %v", err)
	}
	if j.Op != "seed" {
		t.Errorf("Op = %q, want %q", j.Op, "seed")
	}
	if j.Bank != "pool-bank" {
		t.Errorf("Bank = %q, want the active bank", j.Bank)
	}

	snap := waitIdle(t, c.Store)
	if snap.LastJob == nil || snap.LastJob.Error != "" {
		t.Fatalf("job did not complete cleanly: %+v", snap.LastJob)
	}

	want := []string{
		"exec:k8s-env:bash -c bash /banks/pool-bank/q03/setup.sh",
		"exec:k8s-env:bash -c bash /banks/pool-bank/q01/setup.sh",
	}
	got := execs(eng)
	if len(got) != len(want) {
		t.Fatalf("ran %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("exec[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

// Every question id here arrives from a browser one hop upstream and
// ends up inside a shell command. Both gates — the pattern and the
// catalog allowlist — have to hold for EVERY id in the list, and nothing
// may reach the engine when one of them does not.
func TestStartSeedRejectsAnythingNotInTheBank(t *testing.T) {
	for _, qid := range []string{
		"../../etc/passwd",
		"q01; rm -rf /",
		"q01 && curl evil",
		"$(whoami)",
		"q99", // well-formed, but not in this bank
		"Q01", // wrong case
		"",
	} {
		eng := &fakeEngine{}
		c := seedFixture(t, eng, "idle", "hands-on")

		// Buried among valid ids: a list is only as safe as its worst entry.
		if _, err := c.StartSeed([]string{"q01", qid, "q02"}); !errors.Is(err, ErrUnknownQuestion) {
			t.Errorf("StartSeed(%q) error = %v, want ErrUnknownQuestion", qid, err)
		}
		if got := execs(eng); len(got) != 0 {
			t.Errorf("StartSeed(%q) reached the engine: %v", qid, got)
		}
		if c.Store.Status().Busy {
			t.Errorf("StartSeed(%q) began a job", qid)
		}
	}
}

// A repeated id is a caller bug, not something to quietly collapse:
// running one question's setup.sh twice re-seeds a question the loop has
// already prepared.
func TestStartSeedRejectsDuplicates(t *testing.T) {
	eng := &fakeEngine{}
	c := seedFixture(t, eng, "idle", "hands-on")

	if _, err := c.StartSeed([]string{"q01", "q02", "q01"}); !errors.Is(err, ErrUnknownQuestion) {
		t.Errorf("error = %v, want ErrUnknownQuestion for a repeated id", err)
	}
	if got := execs(eng); len(got) != 0 {
		t.Errorf("a duplicate list reached the engine: %v", got)
	}
}

func TestStartSeedRejectsAnEmptyList(t *testing.T) {
	eng := &fakeEngine{}
	c := seedFixture(t, eng, "idle", "hands-on")

	if _, err := c.StartSeed(nil); !errors.Is(err, ErrNoSeedTargets) {
		t.Errorf("error = %v, want ErrNoSeedTargets", err)
	}

	tooMany := make([]string, maxSeedQuestions+1)
	for i := range tooMany {
		tooMany[i] = "q01"
	}
	if _, err := c.StartSeed(tooMany); !errors.Is(err, ErrNoSeedTargets) {
		t.Errorf("error = %v, want ErrNoSeedTargets for an oversized list", err)
	}
}

// Seeding re-runs setup.sh, which discards whatever the candidate did to
// those questions. Fine before an attempt; hostile during one.
func TestStartSeedRefusesWhileASessionIsRunning(t *testing.T) {
	eng := &fakeEngine{}
	c := seedFixture(t, eng, "running", "hands-on")

	if _, err := c.StartSeed([]string{"q01"}); !errors.Is(err, ErrSessionRunning) {
		t.Errorf("error = %v, want ErrSessionRunning", err)
	}
	if got := execs(eng); len(got) != 0 {
		t.Errorf("seeding ran during an attempt: %v", got)
	}
}

// An mcq bank has no setup.sh at all, so every exec would be the same
// confusing bash error. Refuse before anything shells out.
func TestStartSeedRefusesOnAnMCQBank(t *testing.T) {
	eng := &fakeEngine{}
	c := seedFixture(t, eng, "idle", "mcq")

	if _, err := c.StartSeed([]string{"q01"}); !errors.Is(err, ErrNoSeed) {
		t.Errorf("error = %v, want ErrNoSeed", err)
	}
	if got := execs(eng); len(got) != 0 {
		t.Errorf("seeding ran against an mcq bank: %v", got)
	}
}

// A setup.sh that fails must fail the JOB, naming the question, and must
// not go on to the rest of the list: a cluster prepared for two of four
// questions is not an exam, and the candidate has to be told rather than
// dropped into it.
func TestStartSeedFailsAtTheFirstBadSetup(t *testing.T) {
	eng := &fakeEngine{
		execExit: map[string]int{"k8s-env": 1},
		execOut:  map[string]string{"k8s-env": "error: the thing exploded"},
	}
	c := seedFixture(t, eng, "idle", "hands-on")

	if _, err := c.StartSeed([]string{"q02", "q03", "q04"}); err != nil {
		t.Fatalf("StartSeed: %v", err)
	}
	snap := waitIdle(t, c.Store)

	if snap.LastJob == nil || snap.LastJob.Error == "" {
		t.Fatalf("job did not fail: %+v", snap.LastJob)
	}
	if !strings.Contains(snap.LastJob.Error, "q02") {
		t.Errorf("error = %q, want it to name the question that failed", snap.LastJob.Error)
	}
	if !strings.Contains(snap.LastJob.Error, "exploded") {
		t.Errorf("error = %q, want the script's own output", snap.LastJob.Error)
	}
	if got := execs(eng); len(got) != 1 {
		t.Errorf("ran %v after the first failure; want it to stop", got)
	}
	if snap.LastJob.Phases[0].State != job.PhaseFailed {
		t.Errorf("phase state = %q, want failed", snap.LastJob.Phases[0].State)
	}
}

// The progress a candidate watches: the phase's detail counts through
// the list rather than echoing setup.sh's last line, and the retained
// build log keeps every line so someone who looked away can still read
// the minutes they missed.
func TestStartSeedReportsProgress(t *testing.T) {
	var mu sync.Mutex
	var details []string

	eng := &fakeEngine{
		execLines: map[string][]string{"k8s-env": {"namespace/x created", "deployment.apps/y created"}},
	}
	c := seedFixture(t, eng, "idle", "hands-on")
	// Sampled from inside the exec, which is the only moment the running
	// phase's detail exists — StartPhase clears it the instant it settles.
	eng.afterLine = func() {
		if snap := c.Store.Status(); snap.Job != nil && len(snap.Job.Phases) > 0 {
			mu.Lock()
			details = append(details, snap.Job.Phases[0].Detail)
			mu.Unlock()
		}
	}

	if _, err := c.StartSeed([]string{"q01", "q02", "q03"}); err != nil {
		t.Fatalf("StartSeed: %v", err)
	}
	waitIdle(t, c.Store)

	mu.Lock()
	seen := strings.Join(details, "|")
	mu.Unlock()
	for _, want := range []string{"question 1 of 3", "question 2 of 3", "question 3 of 3"} {
		if !strings.Contains(seen, want) {
			t.Errorf("phase detail never said %q; saw %q", want, seen)
		}
	}
	if strings.Contains(seen, "created") {
		t.Errorf("phase detail echoed setup.sh output (%q); the count is the useful line", seen)
	}

	_, lines := c.Store.Log()
	joined := strings.Join(lines, "\n")
	for _, want := range []string{
		"seeding q01 (1 of 3)", "seeding q02 (2 of 3)", "seeding q03 (3 of 3)",
		"namespace/x created",
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("build log is missing %q; got:\n%s", want, joined)
		}
	}
}

// The single-job lock is not optional here: a reset is rebuilding the
// very cluster this would seed into.
func TestStartSeedYieldsToAnotherJob(t *testing.T) {
	eng := &fakeEngine{}
	c := seedFixture(t, eng, "idle", "hands-on")

	if _, err := c.Store.Begin("reset", "", []job.PhaseSpec{{ID: "verify", Label: "Verify"}}); err != nil {
		t.Fatalf("Begin: %v", err)
	}
	if _, err := c.StartSeed([]string{"q01"}); !errors.Is(err, job.ErrBusy) {
		t.Errorf("error = %v, want job.ErrBusy", err)
	}
}
