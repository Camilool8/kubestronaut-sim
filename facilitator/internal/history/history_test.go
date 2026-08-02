// These tests live in package history rather than history_test so the
// frozen-store case can be reached directly. Every other way of making
// os.Rename fail (a read-only parent directory, an unwritable file)
// relies on not being root, and the container these tests run in is.
package history

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

var epoch = time.Date(2026, 3, 1, 9, 0, 0, 0, time.UTC)

func tempPath(t *testing.T) string {
	t.Helper()
	return filepath.Join(t.TempDir(), "history.json")
}

// rec builds a minimal counted, passing record.
func rec(id, bank, cert string, gradedAt time.Time, percent int) Record {
	return Record{
		ID:            id,
		Bank:          bank,
		Certification: cert,
		ExamType:      "hands-on",
		Mode:          "exam",
		StartedAt:     gradedAt.Add(-time.Hour),
		GradedAt:      gradedAt,
		QuestionCount: 22,
		Earned:        percent,
		Total:         100,
		Percent:       percent,
		PassingScore:  66,
		Passed:        percent >= 66,
		Counted:       true,
	}
}

func TestOpenMissingFileStartsEmpty(t *testing.T) {
	path := tempPath(t)
	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if got := len(s.All()); got != 0 {
		t.Fatalf("All() = %d records, want 0", got)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Errorf("Open created %s; it must not write until something is recorded", path)
	}
}

func TestAddPersistsAcrossOpen(t *testing.T) {
	path := tempPath(t)
	s, _ := Open(path)
	added, err := s.Add(rec("a1", "ckad-mock-01", "CKAD", epoch, 70))
	if err != nil {
		t.Fatalf("Add: %v", err)
	}
	if !added {
		t.Fatal("Add reported added=false for a new record")
	}

	reopened, err := Open(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	got := reopened.All()
	if len(got) != 1 || got[0].ID != "a1" || got[0].Percent != 70 {
		t.Fatalf("after reopen All() = %#v, want the one a1 record", got)
	}
}

func TestAddIsIdempotentByID(t *testing.T) {
	s, _ := Open(tempPath(t))
	if _, err := s.Add(rec("a1", "b", "CKAD", epoch, 70)); err != nil {
		t.Fatalf("Add: %v", err)
	}
	added, err := s.Add(rec("a1", "b", "CKAD", epoch, 99))
	if err != nil {
		t.Fatalf("Add again: %v", err)
	}
	if added {
		t.Error("Add reported added=true for an id already present")
	}
	if got := s.All(); len(got) != 1 || got[0].Percent != 70 {
		t.Errorf("All() = %#v, want the ORIGINAL a1 untouched", got)
	}
}

func TestAllIsMostRecentFirst(t *testing.T) {
	s, _ := Open(tempPath(t))
	// Added out of order on purpose: the store orders by gradedAt, not by
	// the order things happened to arrive.
	s.Add(rec("mid", "b", "CKAD", epoch.Add(time.Hour), 60))
	s.Add(rec("old", "b", "CKAD", epoch, 50))
	s.Add(rec("new", "b", "CKAD", epoch.Add(2*time.Hour), 80))

	got := s.All()
	want := []string{"new", "mid", "old"}
	if len(got) != 3 {
		t.Fatalf("All() = %d records, want 3", len(got))
	}
	for i, id := range want {
		if got[i].ID != id {
			t.Errorf("All()[%d].ID = %q, want %q", i, got[i].ID, id)
		}
	}
}

// TestCorruptFileIsRescuedNotDiscarded is the single most important test
// in this package. Discarding a session costs one attempt; discarding
// history is everything the candidate has ever done.
func TestCorruptFileIsRescuedNotDiscarded(t *testing.T) {
	path := tempPath(t)
	garbage := []byte(`{"version":1,"attempts":[{"id":"a1",`)
	if err := os.WriteFile(path, garbage, 0o644); err != nil {
		t.Fatalf("seed corrupt file: %v", err)
	}

	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open must not fail on a corrupt file: %v", err)
	}
	if got := len(s.All()); got != 0 {
		t.Fatalf("All() = %d, want 0 (a fresh record)", got)
	}

	rescued := path + ".corrupt.1"
	saved, err := os.ReadFile(rescued)
	if err != nil {
		t.Fatalf("the corrupt file was not kept at %s: %v", rescued, err)
	}
	if string(saved) != string(garbage) {
		t.Errorf("rescued file = %q, want the original bytes verbatim", saved)
	}
	// And the store is usable: a rescue is not a failure mode.
	if _, err := s.Add(rec("a1", "b", "CKAD", epoch, 70)); err != nil {
		t.Fatalf("Add after rescue: %v", err)
	}
}

func TestRescueNeverClobbersAnEarlierRescue(t *testing.T) {
	path := tempPath(t)
	first := []byte("first casualty")
	os.WriteFile(path, first, 0o644)
	if _, err := Open(path); err != nil {
		t.Fatalf("Open: %v", err)
	}

	second := []byte("second casualty")
	os.WriteFile(path, second, 0o644)
	if _, err := Open(path); err != nil {
		t.Fatalf("Open: %v", err)
	}

	for name, want := range map[string][]byte{
		path + ".corrupt.1": first,
		path + ".corrupt.2": second,
	} {
		got, err := os.ReadFile(name)
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		if string(got) != string(want) {
			t.Errorf("%s = %q, want %q", name, got, want)
		}
	}
}

func TestFutureVersionIsRescuedNotDiscarded(t *testing.T) {
	path := tempPath(t)
	doc := []byte(`{"version":99,"attempts":[{"id":"a1","bank":"b"}]}`)
	os.WriteFile(path, doc, 0o644)

	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if got := len(s.All()); got != 0 {
		t.Fatalf("All() = %d, want 0", got)
	}
	if got, err := os.ReadFile(path + ".corrupt.1"); err != nil || string(got) != string(doc) {
		t.Errorf("version-99 document was not preserved: %q, %v", got, err)
	}
}

// A document with no version field is a /api/history body someone saved,
// or one written before the field existed. It is readable, so it is
// read — refusing it would report data loss that has not happened.
func TestVersionZeroDocumentIsRead(t *testing.T) {
	path := tempPath(t)
	os.WriteFile(path, []byte(`{"attempts":[{"id":"a1","bank":"b","percent":70}]}`), 0o644)

	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if got := s.All(); len(got) != 1 || got[0].ID != "a1" {
		t.Fatalf("All() = %#v, want the a1 record", got)
	}
	if _, err := os.Stat(path + ".corrupt.1"); !os.IsNotExist(err) {
		t.Error("a version-0 document was rescued; it should simply have been read")
	}
}

// A frozen store is what happens when the file could neither be read nor
// moved aside. It must refuse to write rather than clobber bytes nobody
// has managed to look at yet.
func TestFrozenStoreRefusesToWrite(t *testing.T) {
	path := tempPath(t)
	original := []byte("bytes nobody has rescued")
	os.WriteFile(path, original, 0o644)

	s := &Store{path: path, frozen: true, frozenReason: "test"}
	if _, err := s.Add(rec("a1", "b", "CKAD", epoch, 70)); err == nil {
		t.Fatal("Add on a frozen store returned nil; it must refuse")
	}
	if err := s.Clear(); err == nil {
		t.Fatal("Clear on a frozen store returned nil; it must refuse")
	}
	if got, _ := os.ReadFile(path); string(got) != string(original) {
		t.Errorf("the file was modified by a frozen store: %q", got)
	}
}

func TestMergeSkipsRecordsAlreadyPresent(t *testing.T) {
	s, _ := Open(tempPath(t))
	s.Add(rec("a1", "b", "CKAD", epoch, 70))

	in := []Record{
		rec("a1", "b", "CKAD", epoch, 70),                // already here
		rec("a2", "b", "CKAD", epoch.Add(time.Hour), 80), // new
		rec("", "b", "CKAD", epoch.Add(2*time.Hour), 90), // no id, undedupable
	}
	imported, skipped, err := s.Merge(in)
	if err != nil {
		t.Fatalf("Merge: %v", err)
	}
	if imported != 1 || skipped != 2 {
		t.Fatalf("Merge = (%d imported, %d skipped), want (1, 2)", imported, skipped)
	}
	if got := len(s.All()); got != 2 {
		t.Fatalf("All() = %d records, want 2", got)
	}

	// Importing the same document again must be a complete no-op.
	imported, skipped, err = s.Merge(in)
	if err != nil {
		t.Fatalf("Merge again: %v", err)
	}
	if imported != 0 || skipped != 3 {
		t.Errorf("second Merge = (%d, %d), want (0, 3)", imported, skipped)
	}
}

// Importing a backup must never lose the attempts made since it was
// taken — the whole reason import merges rather than replaces.
func TestMergeKeepsAttemptsNewerThanTheBackup(t *testing.T) {
	s, _ := Open(tempPath(t))
	s.Add(rec("since", "b", "CKAD", epoch.Add(48*time.Hour), 95))

	backup := []Record{rec("older", "b", "CKAD", epoch, 40)}
	if _, _, err := s.Merge(backup); err != nil {
		t.Fatalf("Merge: %v", err)
	}

	ids := map[string]bool{}
	for _, r := range s.All() {
		ids[r.ID] = true
	}
	if !ids["since"] || !ids["older"] {
		t.Fatalf("after import the record holds %v, want both since and older", ids)
	}
}

func TestClearErasesEverything(t *testing.T) {
	path := tempPath(t)
	s, _ := Open(path)
	s.Add(rec("a1", "b", "CKAD", epoch, 70))
	if err := s.Clear(); err != nil {
		t.Fatalf("Clear: %v", err)
	}
	if got := len(s.All()); got != 0 {
		t.Fatalf("All() = %d, want 0", got)
	}
	reopened, _ := Open(path)
	if got := len(reopened.All()); got != 0 {
		t.Fatalf("after reopen All() = %d, want 0", got)
	}
}

func TestDocumentRoundTripsThroughJSON(t *testing.T) {
	s, _ := Open(tempPath(t))
	s.Add(rec("a1", "ckad-mock-01", "CKAD", epoch, 70))

	data, err := json.Marshal(s.Document())
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var back Document
	if err := json.Unmarshal(data, &back); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if back.Version != documentVersion || len(back.Attempts) != 1 || back.Attempts[0].ID != "a1" {
		t.Fatalf("round trip = %#v", back)
	}

	// The wire contract types these as strings; a Go time.Time that ever
	// stopped marshalling as RFC3339 would break the client silently.
	var wire struct {
		Attempts []map[string]any `json:"attempts"`
	}
	json.Unmarshal(data, &wire)
	if got, _ := wire.Attempts[0]["gradedAt"].(string); got != "2026-03-01T09:00:00Z" {
		t.Errorf("gradedAt on the wire = %q, want RFC3339", got)
	}
	if _, ok := wire.Attempts[0]["counted"]; !ok {
		t.Error("counted is missing from the wire shape; it must always be present")
	}
}

func TestWriteFailureLeavesTheRecordUnchanged(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "gone", "history.json")
	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if _, err := s.Add(rec("a1", "b", "CKAD", epoch, 70)); err == nil {
		t.Fatal("Add into a missing directory returned nil, want an error")
	}
	if got := len(s.All()); got != 0 {
		t.Errorf("All() = %d after a failed write, want 0 — memory must not diverge from disk", got)
	}
}
