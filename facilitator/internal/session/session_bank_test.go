package session

import (
	"encoding/json"
	"errors"
	"os"
	"testing"
	"time"
)

const testBank = "ckad-mock-01"

// Start must mint a fresh attempt token per attempt so late grading
// writes can be tied to the attempt they graded.
func TestStartMintsAttemptToken(t *testing.T) {
	clock, _ := fakeClock(time.Now())
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	if got := m.AttemptToken(); got != "" {
		t.Fatalf("idle AttemptToken = %q, want empty", got)
	}
	if _, err := m.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	tok1 := m.AttemptToken()
	if tok1 == "" {
		t.Fatal("AttemptToken empty after Start")
	}

	if err := m.Reset(); err != nil {
		t.Fatalf("Reset: %v", err)
	}
	if got := m.AttemptToken(); got != "" {
		t.Fatalf("AttemptToken after Reset = %q, want empty", got)
	}
	if _, err := m.Start(); err != nil {
		t.Fatalf("second Start: %v", err)
	}
	if tok2 := m.AttemptToken(); tok2 == tok1 {
		t.Fatalf("second attempt reused token %q", tok2)
	}
}

func TestSetResultsRequiresMatchingToken(t *testing.T) {
	start := time.Now()
	clock, setClock := fakeClock(start)
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	tok := m.AttemptToken()
	setClock(start.Add(time.Minute))
	if err := m.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}

	if err := m.SetResults("not-the-token", json.RawMessage(`{"earned":1}`)); !errors.Is(err, ErrConflict) {
		t.Fatalf("SetResults with wrong token = %v, want ErrConflict", err)
	}
	if err := m.SetGradeError("not-the-token", "boom"); !errors.Is(err, ErrConflict) {
		t.Fatalf("SetGradeError with wrong token = %v, want ErrConflict", err)
	}
	if err := m.SetResults(tok, json.RawMessage(`{"earned":1}`)); err != nil {
		t.Fatalf("SetResults with matching token: %v", err)
	}
}

// The documented generation-token residual: a grade captured for attempt
// A must not land once attempt B has ended, even though the state guard
// alone (state == ended) would let it through.
func TestSetResultsStaleAcrossFullSecondLifecycle(t *testing.T) {
	start := time.Now()
	clock, setClock := fakeClock(start)
	m, err := New(sessionPath(t), testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	if _, err := m.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	tok1 := m.AttemptToken()
	setClock(start.Add(time.Minute))
	if err := m.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}

	// Full second lifecycle while attempt A's grade is still "in flight".
	if err := m.Reset(); err != nil {
		t.Fatalf("Reset: %v", err)
	}
	if _, err := m.Start(); err != nil {
		t.Fatalf("second Start: %v", err)
	}
	setClock(start.Add(2 * time.Minute))
	if err := m.End("submitted"); err != nil {
		t.Fatalf("second End: %v", err)
	}

	if err := m.SetResults(tok1, json.RawMessage(`{"earned":1}`)); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale SetResults = %v, want ErrConflict", err)
	}
	if _, _, graded := m.Results(); graded {
		t.Fatal("stale write must not mark the new attempt graded")
	}
}

// A persisted session belonging to a different bank must be discarded on
// load — resumed sessions may only continue the bank they started on.
func TestNewDiscardsPersistedSessionFromOtherBank(t *testing.T) {
	start := time.Now()
	clock, _ := fakeClock(start)
	path := sessionPath(t)

	m1, err := New(path, "ckad-mock-01", testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m1.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}

	m2, err := New(path, "cka-mock-01", testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New (other bank): %v", err)
	}
	if got := m2.Snapshot().State; got != "idle" {
		t.Fatalf("state after cross-bank load = %q, want idle", got)
	}
}

// Version-1 session files predate bank identity; they must be treated as
// unknown-bank and discarded rather than resumed.
func TestNewDiscardsVersion1File(t *testing.T) {
	path := sessionPath(t)
	v1 := `{"version":1,"state":"running","startedAt":"2026-07-24T10:00:00Z","durationSeconds":7200,"endedAt":null,"endReason":"","gradeError":""}`
	if err := os.WriteFile(path, []byte(v1), 0o644); err != nil {
		t.Fatalf("write v1 file: %v", err)
	}

	clock, _ := fakeClock(time.Now())
	m, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if got := m.Snapshot().State; got != "idle" {
		t.Fatalf("state after v1 load = %q, want idle", got)
	}
}

// Same-bank resume keeps working and exposes the bank on snapshots.
func TestBankResumedAndExposed(t *testing.T) {
	start := time.Now()
	clock, _ := fakeClock(start)
	path := sessionPath(t)

	m1, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := m1.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	tok := m1.AttemptToken()

	m2, err := New(path, testBank, testDur, clock, func() {})
	if err != nil {
		t.Fatalf("resume New: %v", err)
	}
	snap := m2.Snapshot()
	if snap.State != "running" {
		t.Fatalf("resumed state = %q, want running", snap.State)
	}
	if snap.Bank != testBank {
		t.Fatalf("resumed Bank = %q, want %q", snap.Bank, testBank)
	}
	if got := m2.AttemptToken(); got != tok {
		t.Fatalf("resumed AttemptToken = %q, want %q", got, tok)
	}
}
