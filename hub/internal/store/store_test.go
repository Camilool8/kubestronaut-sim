package store

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func newStore(t *testing.T) *Store {
	t.Helper()
	s, err := New(t.TempDir())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return s
}

func record(id, gradedAt string, extra string) json.RawMessage {
	return json.RawMessage(`{"id":"` + id + `","gradedAt":"` + gradedAt + `"` + extra + `}`)
}

func TestAnUnknownFieldSurvivesVerbatim(t *testing.T) {
	s := newStore(t)
	in := record("a1", "2026-08-03T10:00:00Z", `,"aFieldAddedLater":{"nested":[1,2,3]},"percent":91`)

	if added, err := s.Add("1234", in, nil); err != nil || !added {
		t.Fatalf("Add = %v, %v; want true, nil", added, err)
	}
	doc, err := s.Document("1234")
	if err != nil {
		t.Fatalf("Document: %v", err)
	}
	if len(doc.Attempts) != 1 {
		t.Fatalf("attempts = %d, want 1", len(doc.Attempts))
	}
	var got, want any
	if err := json.Unmarshal(doc.Attempts[0], &got); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(in, &want); err != nil {
		t.Fatal(err)
	}
	gotJSON, _ := json.Marshal(got)
	wantJSON, _ := json.Marshal(want)
	if string(gotJSON) != string(wantJSON) {
		t.Errorf("record changed in storage:\n got %s\nwant %s", gotJSON, wantJSON)
	}
}

func TestAddIsIdempotentOnAttemptID(t *testing.T) {
	s := newStore(t)
	first := record("a1", "2026-08-03T10:00:00Z", `,"earned":10`)
	again := record("a1", "2026-08-03T10:00:00Z", `,"earned":10`)

	if added, err := s.Add("1234", first, nil); err != nil || !added {
		t.Fatalf("first Add = %v, %v; want true, nil", added, err)
	}
	added, err := s.Add("1234", again, nil)
	if err != nil {
		t.Fatalf("second Add: %v", err)
	}
	if added {
		t.Error("second Add reported the attempt as new")
	}
	doc, _ := s.Document("1234")
	if len(doc.Attempts) != 1 {
		t.Errorf("attempts = %d, want 1 after a duplicate", len(doc.Attempts))
	}
}

func TestAttemptsComeBackOldestFirst(t *testing.T) {
	s := newStore(t)
	for _, r := range []json.RawMessage{
		record("c", "2026-08-03T12:00:00Z", ""),
		record("a", "2026-08-03T10:00:00Z", ""),
		record("b", "2026-08-03T11:00:00Z", ""),
	} {
		if _, err := s.Add("1234", r, nil); err != nil {
			t.Fatal(err)
		}
	}
	doc, _ := s.Document("1234")
	var ids []string
	for _, a := range doc.Attempts {
		var h header
		json.Unmarshal(a, &h)
		ids = append(ids, h.ID)
	}
	if strings.Join(ids, ",") != "a,b,c" {
		t.Errorf("order = %v, want a,b,c (oldest first)", ids)
	}
}

func TestTraversalAndOddNamesAreRefused(t *testing.T) {
	s := newStore(t)
	good := record("a1", "2026-08-03T10:00:00Z", "")
	for _, bad := range []string{
		"../etc/passwd", "..", ".", "a/b", "a\\b", "", "with space",
		"a\x00b", strings.Repeat("x", 65), "-leading-dash",
	} {
		if _, err := s.Add(bad, good, nil); !errors.Is(err, ErrBadName) {
			t.Errorf("Add(user=%q) error = %v, want ErrBadName", bad, err)
		}
		if _, err := s.Document(bad); !errors.Is(err, ErrBadName) {
			t.Errorf("Document(%q) error = %v, want ErrBadName", bad, err)
		}
		if _, err := s.Results(bad, "a1"); !errors.Is(err, ErrBadName) {
			t.Errorf("Results(user=%q) error = %v, want ErrBadName", bad, err)
		}
		if _, err := s.Results("1234", bad); !errors.Is(err, ErrBadName) {
			t.Errorf("Results(attempt=%q) error = %v, want ErrBadName", bad, err)
		}
	}

	evil := record("../../escape", "2026-08-03T10:00:00Z", "")
	if _, err := s.Add("1234", evil, json.RawMessage(`{"x":1}`)); !errors.Is(err, ErrBadName) {
		t.Errorf("Add with a traversing attempt id = %v, want ErrBadName", err)
	}
}

func TestResultsRoundTripAndMissingIsNotFound(t *testing.T) {
	s := newStore(t)
	results := json.RawMessage(`{"checks":[{"id":"q01","passed":true}]}`)
	if _, err := s.Add("1234", record("a1", "2026-08-03T10:00:00Z", ""), results); err != nil {
		t.Fatal(err)
	}

	got, err := s.Results("1234", "a1")
	if err != nil {
		t.Fatalf("Results: %v", err)
	}
	if string(got) != string(results) {
		t.Errorf("results = %s, want %s", got, results)
	}
	if _, err := s.Results("1234", "nosuch"); !errors.Is(err, ErrNotFound) {
		t.Errorf("missing results error = %v, want ErrNotFound", err)
	}
}

func TestUsersAreIsolatedAndNewUsersAreEmptyNotAnError(t *testing.T) {
	s := newStore(t)
	if _, err := s.Add("1111", record("a1", "2026-08-03T10:00:00Z", ""), nil); err != nil {
		t.Fatal(err)
	}

	doc, err := s.Document("2222")
	if err != nil {
		t.Fatalf("a user with no history is not an error: %v", err)
	}
	if len(doc.Attempts) != 0 {
		t.Errorf("new user saw %d attempts, want 0", len(doc.Attempts))
	}

	b, _ := json.Marshal(doc)
	if !strings.Contains(string(b), `"attempts":[]`) {
		t.Errorf("empty document marshalled as %s, want an empty array", b)
	}
	if doc.Version != documentVersion {
		t.Errorf("version = %d, want %d", doc.Version, documentVersion)
	}
}
