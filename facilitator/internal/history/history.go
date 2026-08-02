// Package history is the durable record of graded attempts: one JSON
// document under /state that outlives the session file, a bank switch,
// `./sim reset`, and `./sim purge`.
//
// Not to be confused with docs/history/, which is frozen design
// documentation and has nothing to do with this. This package is the
// candidate's attempt record.
//
// Two rules separate it from the session package it sits beside, and
// both come from the same asymmetry: a discarded session costs one
// attempt, while a discarded record costs everything the candidate has
// ever done.
//
//  1. A file this package cannot read is NEVER removed or truncated. It
//     is renamed aside (history.json.corrupt.N, picking a suffix that is
//     free so an earlier rescue is never clobbered) and a fresh record
//     started. session.New's discard-on-version-mismatch policy is
//     deliberately not copied here.
//  2. If the rescue itself fails, the store goes read-only for the rest
//     of the process rather than writing over a file it could neither
//     read nor save. Grading still works; it just does not record.
//
// Writes are atomic (temp file in the same directory, then os.Rename,
// exactly as session.persistLocked does) and guarded by one mutex, so a
// crash mid-write leaves the previous document intact.
package history

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
)

// documentVersion is the on-disk (and export/import) format this build
// writes.
//
// Unlike the session file's version, a bump here must never discard
// anything: old documents are migrated or, failing that, rescued to one
// side and reported. A reader that cannot understand a version reads it
// as data loss, not as a stale cache.
const documentVersion = 1

// maxRescueAttempts bounds the search for a free .corrupt.N suffix. A
// thousand unreadable history files is not a situation more suffixes
// would improve, and an unbounded loop here would hang the boot.
const maxRescueAttempts = 1000

// Document is the persisted (and exported) shape: a version and the
// attempts, oldest first — append order, which is also grading order.
type Document struct {
	Version  int      `json:"version"`
	Attempts []Record `json:"attempts"`
}

// CheckDocument reports whether doc is something this build may merge.
//
// Lenient on purpose in one direction and strict in the other. Version 0
// is accepted — it is either a document written before the field existed
// or a saved GET /api/history body, and both are readable. A version
// from the future is refused, because merging a shape this build does
// not understand would silently drop whatever fields it added, and the
// candidate would keep the import as their backup.
func CheckDocument(doc Document) error {
	if doc.Version > documentVersion {
		return fmt.Errorf("this document is version %d and this build understands up to %d; upgrade before importing it", doc.Version, documentVersion)
	}
	return nil
}

// Store owns the attempt record at one path. All methods are safe for
// concurrent use.
type Store struct {
	mu   sync.Mutex
	path string
	// records is in append (chronological) order. All returns the
	// reverse, because every display of this wants the newest first.
	records []Record
	// frozen is set when the document on disk could neither be read nor
	// moved aside. Every write then refuses instead of overwriting a file
	// whose contents are still unaccounted for.
	frozen       bool
	frozenReason string
}

// Open loads the record at path, or starts an empty one when the file
// does not exist (the normal first run, and silent).
//
// It never returns an error for a bad file. An unreadable, unparseable,
// or unknown-version document is moved aside and reported on stderr, and
// the store starts empty; if it cannot be moved aside, the store starts
// empty AND read-only, so the bytes on disk survive to be looked at by
// hand. Either way the facilitator boots and the exam runs — history
// must never be the reason an attempt cannot be sat.
func Open(path string) (*Store, error) {
	s := &Store{path: path}

	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return s, nil
		}
		s.rescue(fmt.Sprintf("cannot read %s: %v", path, err))
		return s, nil
	}

	var doc Document
	if err := json.Unmarshal(raw, &doc); err != nil {
		s.rescue(fmt.Sprintf("%s is not valid JSON: %v", path, err))
		return s, nil
	}
	// Version 0 is a document written before the field existed, or a
	// saved GET /api/history body. It is readable, so it is read: the
	// alternative is telling a candidate their attempts are gone because
	// of a number they never saw.
	if doc.Version > documentVersion {
		s.rescue(fmt.Sprintf("%s is version %d, this build understands up to %d", path, doc.Version, documentVersion))
		return s, nil
	}

	s.records = doc.Attempts
	sortByGradedAt(s.records)
	return s, nil
}

// rescue moves the file at s.path out of the way so a fresh record can
// start without destroying the old one, and reports what happened on
// stderr. The store is left empty; it is left read-only as well if the
// move failed.
func (s *Store) rescue(why string) {
	dest, err := freeRescuePath(s.path)
	if err == nil {
		err = os.Rename(s.path, dest)
	}
	if err != nil {
		s.frozen = true
		s.frozenReason = fmt.Sprintf("%s, and it could not be moved aside (%v)", why, err)
		fmt.Fprintf(os.Stderr, "history: %s\nhistory: %s could not be moved aside (%v); attempts will NOT be recorded this run, and the file has been left untouched\n", why, s.path, err)
		return
	}
	fmt.Fprintf(os.Stderr, "history: %s\nhistory: it has been kept at %s and a fresh record started; nothing was deleted\n", why, dest)
}

// freeRescuePath returns the first path.corrupt.N that does not already
// exist. Never reuses a suffix: an earlier rescue is itself the only
// copy of whatever it holds.
func freeRescuePath(path string) (string, error) {
	for n := 1; n <= maxRescueAttempts; n++ {
		candidate := fmt.Sprintf("%s.corrupt.%d", path, n)
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("all %d .corrupt.N names beside %s are taken", maxRescueAttempts, path)
}

// Add appends r and persists, unless a record with the same id is
// already present — in which case it is a no-op reporting added=false.
//
// The id is the attempt's own token, so a grade recorded twice for one
// attempt (a recovery re-grade after a crash) updates nothing rather
// than showing the candidate the same sitting twice.
func (s *Store) Add(r Record) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, existing := range s.records {
		if existing.ID == r.ID {
			return false, nil
		}
	}
	next := append(append([]Record(nil), s.records...), r)
	sortByGradedAt(next)
	if err := s.writeLocked(next); err != nil {
		return false, err
	}
	s.records = next
	return true, nil
}

// Merge folds an imported document into the record: records whose id is
// already present are skipped, everything else is added.
//
// Merge, never replace. Importing a backup must not be a way to silently
// lose the attempts made since it was taken, and importing the same file
// twice must be a no-op.
func (s *Store) Merge(in []Record) (imported, skipped int, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	seen := make(map[string]bool, len(s.records))
	for _, existing := range s.records {
		seen[existing.ID] = true
	}
	next := append([]Record(nil), s.records...)
	for _, r := range in {
		// An id-less record cannot be de-duplicated, so it can never be
		// imported idempotently. Skipping it beats growing a duplicate on
		// every import of the same file.
		if r.ID == "" || seen[r.ID] {
			skipped++
			continue
		}
		seen[r.ID] = true
		next = append(next, r)
		imported++
	}
	if imported == 0 {
		return 0, skipped, nil
	}
	sortByGradedAt(next)
	if err := s.writeLocked(next); err != nil {
		return 0, 0, err
	}
	s.records = next
	return imported, skipped, nil
}

// All returns every record, most recent first — the order every display
// of this wants, and the order the wire contract promises.
func (s *Store) All() []Record {
	s.mu.Lock()
	defer s.mu.Unlock()

	out := make([]Record, 0, len(s.records))
	for i := len(s.records) - 1; i >= 0; i-- {
		out = append(out, s.records[i])
	}
	return out
}

// Document returns the export document: the same bytes-worth of shape
// Open reads and Merge accepts, so an export can always be imported.
func (s *Store) Document() Document {
	s.mu.Lock()
	defer s.mu.Unlock()

	return Document{
		Version:  documentVersion,
		Attempts: append([]Record(nil), s.records...),
	}
}

// Clear erases every record. This is the one destructive operation in
// the package, and it is destructive on purpose: it exists because the
// candidate asked for it. There is no undo, so the caller owns the
// confirmation.
func (s *Store) Clear() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.writeLocked(nil); err != nil {
		return err
	}
	s.records = nil
	return nil
}

// writeLocked atomically replaces the document on disk with records
// (temp file in the same directory, then os.Rename). The caller must
// hold s.mu. It refuses outright on a frozen store.
func (s *Store) writeLocked(records []Record) error {
	if s.frozen {
		return fmt.Errorf("history: not recording: %s", s.frozenReason)
	}

	data, err := json.Marshal(&Document{Version: documentVersion, Attempts: records})
	if err != nil {
		return fmt.Errorf("history: marshal: %w", err)
	}

	dir := filepath.Dir(s.path)
	tmp, err := os.CreateTemp(dir, ".history-*.tmp")
	if err != nil {
		return fmt.Errorf("history: create temp file in %s: %w", dir, err)
	}
	tmpPath := tmp.Name()

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("history: write %s: %w", tmpPath, err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("history: close %s: %w", tmpPath, err)
	}
	if err := os.Rename(tmpPath, s.path); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("history: rename %s to %s: %w", tmpPath, s.path, err)
	}
	return nil
}

// sortByGradedAt puts records in grading order, oldest first, with the
// id as a tiebreaker so two attempts graded in the same second (an mcq
// bank grades instantly, and tests grade on a frozen clock) always come
// out in the same order.
func sortByGradedAt(records []Record) {
	sort.SliceStable(records, func(i, j int) bool {
		if records[i].GradedAt.Equal(records[j].GradedAt) {
			return records[i].ID < records[j].ID
		}
		return records[i].GradedAt.Before(records[j].GradedAt)
	})
}
