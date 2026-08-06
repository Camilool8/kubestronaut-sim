package history

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
)

const documentVersion = 1

const maxRescueAttempts = 1000

type Document struct {
	Version  int      `json:"version"`
	Attempts []Record `json:"attempts"`
}

func CheckDocument(doc Document) error {
	if doc.Version > documentVersion {
		return fmt.Errorf("this document is version %d and this build understands up to %d; upgrade before importing it", doc.Version, documentVersion)
	}
	return nil
}

type Store struct {
	mu   sync.Mutex
	path string

	records []Record

	frozen       bool
	frozenReason string
}

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

	if doc.Version > documentVersion {
		s.rescue(fmt.Sprintf("%s is version %d, this build understands up to %d", path, doc.Version, documentVersion))
		return s, nil
	}

	s.records = doc.Attempts
	sortByGradedAt(s.records)
	return s, nil
}

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

func freeRescuePath(path string) (string, error) {
	for n := 1; n <= maxRescueAttempts; n++ {
		candidate := fmt.Sprintf("%s.corrupt.%d", path, n)
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("all %d .corrupt.N names beside %s are taken", maxRescueAttempts, path)
}

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

func (s *Store) Merge(in []Record) (imported, skipped int, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	seen := make(map[string]bool, len(s.records))
	for _, existing := range s.records {
		seen[existing.ID] = true
	}
	next := append([]Record(nil), s.records...)
	for _, r := range in {

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

func (s *Store) All() []Record {
	s.mu.Lock()
	defer s.mu.Unlock()

	out := make([]Record, 0, len(s.records))
	for i := len(s.records) - 1; i >= 0; i-- {
		out = append(out, s.records[i])
	}
	return out
}

func (s *Store) Document() Document {
	s.mu.Lock()
	defer s.mu.Unlock()

	return Document{
		Version:  documentVersion,
		Attempts: append([]Record(nil), s.records...),
	}
}

func (s *Store) Clear() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.writeLocked(nil); err != nil {
		return err
	}
	s.records = nil
	return nil
}

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

func sortByGradedAt(records []Record) {
	sort.SliceStable(records, func(i, j int) bool {
		if records[i].GradedAt.Equal(records[j].GradedAt) {
			return records[i].ID < records[j].ID
		}
		return records[i].GradedAt.Before(records[j].GradedAt)
	})
}
