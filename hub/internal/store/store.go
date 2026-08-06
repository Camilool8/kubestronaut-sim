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

const documentVersion = 1

type Document struct {
	Version  int               `json:"version"`
	Attempts []json.RawMessage `json:"attempts"`
}

type header struct {
	ID       string    `json:"id"`
	GradedAt time.Time `json:"gradedAt"`
}

var ErrBadName = errors.New("store: identifier is not a safe path element")

var ErrNotFound = errors.New("store: not found")

var safeName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`)

func checkName(kind, s string) error {
	if !safeName.MatchString(s) {
		return fmt.Errorf("%w: %s %q", ErrBadName, kind, s)
	}
	return nil
}

type Store struct {
	dir string

	mu sync.Mutex
}

func New(dir string) (*Store, error) {
	if dir == "" {
		return nil, errors.New("store: empty directory")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("store: create %s: %w", dir, err)
	}
	return &Store{dir: dir}, nil
}

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
			continue
		}
		if e.ID == h.ID {
			return false, nil
		}
	}

	doc.Attempts = append(doc.Attempts, record)
	sortByGradedAt(doc.Attempts)

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

func (s *Store) Document(user string) (Document, error) {
	if err := checkName("user", user); err != nil {
		return Document{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.documentLocked(user)
}

type History struct {
	Attempts []json.RawMessage `json:"attempts"`
	Summary  Summary           `json:"summary"`
}

func (s *Store) History(user string) (History, error) {
	doc, err := s.Document(user)
	if err != nil {
		return History{}, err
	}

	attempts := make([]json.RawMessage, 0, len(doc.Attempts))
	for i := len(doc.Attempts) - 1; i >= 0; i-- {
		attempts = append(attempts, doc.Attempts[i])
	}
	return History{Attempts: attempts, Summary: summarize(doc.Attempts)}, nil
}

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
