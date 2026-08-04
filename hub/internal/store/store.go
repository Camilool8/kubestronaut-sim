// Package store is the hub's durable record of who attempted what.
//
// It exists because a session Pod is disposable: its /state volume dies
// with it, and the hub recycles Pods for reset, switch, idle reap and
// every crash. The facilitator keeps writing its own history exactly as
// it always has — that is what a local `./sim up` relies on, and it must
// not change — and additionally posts a copy here, where it outlives the
// Pod that produced it.
//
// One document per user, not one shared file. Attempts are rare and
// users are independent, so a shared file would buy nothing and would
// mean one unreadable record costs everyone their history.
//
// Writes are atomic (temp file in the same directory, then os.Rename),
// the same pattern facilitator/internal/history and phase.sh use. A
// crash mid-write leaves the previous document intact.
package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"sync"
	"time"
)

// documentVersion is the on-disk format this build writes.
const documentVersion = 1

// Document is the persisted shape, and also exactly what GET
// /api/history returns — attempts oldest first, which is grading order.
type Document struct {
	Version  int               `json:"version"`
	Attempts []json.RawMessage `json:"attempts"`
}

// Attempts are stored as raw JSON, deliberately.
//
// The facilitator's history.Record has two dozen fields and gains more
// as the product grows. The hub is a separate module and cannot import
// it, so a mirrored struct here would be a hand-maintained copy that
// drifts the first time a field is added over there — and it would drift
// *silently*, because encoding/json discards unknown fields on the way
// in. Passing the record through byte for byte means GET /api/history
// returns precisely what the facilitator would have returned, and the UI
// needs no branch for hosted mode.
//
// Only the two fields the hub itself has to reason about are extracted.
type header struct {
	ID       string    `json:"id"`
	GradedAt time.Time `json:"gradedAt"`
}

// ErrBadName rejects an identifier that cannot be used as a path
// element. Callers pass a GitHub numeric user ID and an attempt token,
// neither of which should ever fail this — which is exactly why a
// failure means something is wrong rather than something is unusual.
var ErrBadName = errors.New("store: identifier is not a safe path element")

// ErrNotFound is returned for an attempt with no stored results blob.
var ErrNotFound = errors.New("store: not found")

// safeName is the whole defence against path traversal. Anything that is
// not plainly a name is refused rather than escaped, because there is no
// legitimate caller that needs a slash, a dot-dot or a control character
// here, and "sanitise it and carry on" is how a traversal gets through.
var safeName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`)

func checkName(kind, s string) error {
	if !safeName.MatchString(s) {
		return fmt.Errorf("%w: %s %q", ErrBadName, kind, s)
	}
	return nil
}

// Store is a directory of per-user history documents.
type Store struct {
	dir string

	// One mutex for the whole store, not one per user. Attempts arrive
	// at human pace — a few per hour across every seat — so contention
	// is not a consideration, and a single lock is one fewer thing to
	// get wrong than a map of locks that must itself be locked.
	mu sync.Mutex
}

// New returns a Store rooted at dir, creating it if needed.
func New(dir string) (*Store, error) {
	if dir == "" {
		return nil, errors.New("store: empty directory")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("store: create %s: %w", dir, err)
	}
	return &Store{dir: dir}, nil
}

// Add records one graded attempt for user, returning whether it was new.
//
// Idempotent on the attempt ID, mirroring history.Store.Add: a recovery
// re-grade, a retried webhook or a duplicate delivery records nothing
// twice. record is the facilitator's history.Record as received; results
// is the full graded-results document, which may be nil.
func (s *Store) Add(user string, record, results json.RawMessage) (bool, error) {
	if err := checkName("user", user); err != nil {
		return false, err
	}
	var h header
	if err := json.Unmarshal(record, &h); err != nil {
		return false, fmt.Errorf("store: unreadable record: %w", err)
	}
	if err := checkName("attempt", h.ID); err != nil {
		return false, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	doc, err := s.documentLocked(user)
	if err != nil {
		return false, err
	}
	for _, existing := range doc.Attempts {
		var e header
		if err := json.Unmarshal(existing, &e); err != nil {
			continue // a record we cannot read cannot be the duplicate
		}
		if e.ID == h.ID {
			return false, nil
		}
	}

	doc.Attempts = append(doc.Attempts, record)
	sortByGradedAt(doc.Attempts)

	// Results first: a results blob with no attempt referencing it is
	// invisible, while an attempt whose results 404 is a broken link the
	// candidate can see.
	if len(results) > 0 {
		if err := s.writeResultsLocked(user, h.ID, results); err != nil {
			return false, err
		}
	}
	if err := s.writeDocumentLocked(user, doc); err != nil {
		return false, err
	}
	return true, nil
}

// Document returns user's attempts, oldest first. A user who has never
// attempted anything gets an empty document rather than an error — that
// is the normal state of a new account, not a failure.
func (s *Store) Document(user string) (Document, error) {
	if err := checkName("user", user); err != nil {
		return Document{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.documentLocked(user)
}

// History is what GET /api/history answers with, and it is a different
// shape from Document on purpose.
//
// Document is the INTERCHANGE format: versioned, oldest first, and the
// thing an export writes and a local `./sim` can import. History is the
// DASHBOARD format the facilitator serves — most recent first, with the
// cross-attempt rollup beside it — and the UI's Progress screen reads
// exactly this. Serving the interchange document here would leave that
// screen with attempts in grading order and no `summary` at all, which
// is a blank dashboard rather than a visibly wrong one.
type History struct {
	// Never nil: the wire contract types this as an array.
	Attempts []json.RawMessage `json:"attempts"`
	Summary  Summary           `json:"summary"`
}

// History returns one user's attempts, most recent first, with the
// rollup.
func (s *Store) History(user string) (History, error) {
	doc, err := s.Document(user)
	if err != nil {
		return History{}, err
	}
	// Reversed rather than re-sorted: the document is already in graded
	// order, which is the order the dashboard wants read backwards, and a
	// sort here would need to decode every record to find a timestamp
	// that Add has already used to place it.
	attempts := make([]json.RawMessage, 0, len(doc.Attempts))
	for i := len(doc.Attempts) - 1; i >= 0; i-- {
		attempts = append(attempts, doc.Attempts[i])
	}
	return History{Attempts: attempts, Summary: summarize(doc.Attempts)}, nil
}

// Clear erases one user's history: every attempt and every results
// blob. There is no undo, which is also true of the facilitator's own
// DELETE /api/history — the difference is that here it is the only copy
// that outlives the Pod.
//
// Removes the user's whole directory rather than truncating the
// document, so a results blob cannot survive the attempt that referenced
// it and reappear against a later attempt with a colliding ID.
func (s *Store) Clear(user string) error {
	if err := checkName("user", user); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.RemoveAll(s.userDir(user)); err != nil {
		return fmt.Errorf("store: clear history for %s: %w", user, err)
	}
	return nil
}

// Results returns the stored graded-results blob for one attempt.
func (s *Store) Results(user, attempt string) (json.RawMessage, error) {
	if err := checkName("user", user); err != nil {
		return nil, err
	}
	if err := checkName("attempt", attempt); err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	b, err := os.ReadFile(s.resultsPath(user, attempt))
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("store: read results: %w", err)
	}
	return b, nil
}

func (s *Store) userDir(user string) string { return filepath.Join(s.dir, user) }
func (s *Store) docPath(user string) string { return filepath.Join(s.userDir(user), "history.json") }
func (s *Store) resultsPath(user, attempt string) string {
	return filepath.Join(s.userDir(user), "results", attempt+".json")
}

func (s *Store) documentLocked(user string) (Document, error) {
	b, err := os.ReadFile(s.docPath(user))
	if errors.Is(err, os.ErrNotExist) {
		return Document{Version: documentVersion, Attempts: []json.RawMessage{}}, nil
	}
	if err != nil {
		return Document{}, fmt.Errorf("store: read history: %w", err)
	}
	var doc Document
	if err := json.Unmarshal(b, &doc); err != nil {
		return Document{}, fmt.Errorf("store: unreadable history for %s: %w", user, err)
	}
	if doc.Attempts == nil {
		doc.Attempts = []json.RawMessage{}
	}
	return doc, nil
}

func (s *Store) writeDocumentLocked(user string, doc Document) error {
	doc.Version = documentVersion
	b, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return fmt.Errorf("store: encode history: %w", err)
	}
	return writeFileAtomic(s.docPath(user), b)
}

func (s *Store) writeResultsLocked(user, attempt string, results json.RawMessage) error {
	return writeFileAtomic(s.resultsPath(user, attempt), results)
}

// writeFileAtomic writes b to path via a temp file in the same directory
// and a rename. Same directory matters: rename(2) is only atomic within
// one filesystem, and a temp dir can be on another.
func writeFileAtomic(path string, b []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("store: create %s: %w", dir, err)
	}
	tmp, err := os.CreateTemp(dir, ".store-*.tmp")
	if err != nil {
		return fmt.Errorf("store: temp file in %s: %w", dir, err)
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(b); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("store: write %s: %w", tmpPath, err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("store: close %s: %w", tmpPath, err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("store: rename %s to %s: %w", tmpPath, path, err)
	}
	return nil
}

// sortByGradedAt keeps attempts oldest first. A record the sort cannot
// read sorts to the end rather than panicking or being dropped.
func sortByGradedAt(attempts []json.RawMessage) {
	at := func(raw json.RawMessage) time.Time {
		var h header
		if err := json.Unmarshal(raw, &h); err != nil {
			return time.Unix(1<<62, 0)
		}
		return h.GradedAt
	}
	sort.SliceStable(attempts, func(i, j int) bool {
		return at(attempts[i]).Before(at(attempts[j]))
	})
}
