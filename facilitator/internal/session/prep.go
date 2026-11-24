package session

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"time"
)

const prepFileName = "prep.json"

const prepVersion = 1

var ErrBadPrep = errors.New("session: unusable prep file")

type Prep struct {
	Version         int        `json:"version"`
	Bank            string     `json:"bank"`
	JobID           string     `json:"jobId"`
	Mode            string     `json:"mode"`
	DurationSeconds int        `json:"durationSeconds"`
	QuestionIDs     []string   `json:"questionIds"`
	Seed            string     `json:"seed,omitempty"`
	PoolDigest      string     `json:"poolDigest,omitempty"`
	DomainFilter    []string   `json:"domainFilter,omitempty"`
	AwaitStart      bool       `json:"awaitStart"`
	Ready           bool       `json:"ready"`
	ReadyAt         *time.Time `json:"readyAt,omitempty"`
	StartedAt       time.Time  `json:"startedAt"`
}

func (p Prep) Draw() Draw {
	return cloneDraw(Draw{
		QuestionIDs:  p.QuestionIDs,
		Seed:         p.Seed,
		PoolDigest:   p.PoolDigest,
		DomainFilter: p.DomainFilter,
	})
}

func (p Prep) Duration() time.Duration {
	return time.Duration(p.DurationSeconds) * time.Second
}

func PrepPath(sessionPath string) string {
	return filepath.Join(filepath.Dir(sessionPath), prepFileName)
}

func SavePrep(path string, p Prep) error {
	p.Version = prepVersion
	data, err := json.Marshal(&p)
	if err != nil {
		return fmt.Errorf("session: marshal prep: %w", err)
	}
	return writeFileAtomic(path, ".prep-*.tmp", data)
}

func LoadPrep(path string) (Prep, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Prep{}, err
	}
	var p Prep
	if err := json.Unmarshal(raw, &p); err != nil {
		return Prep{}, fmt.Errorf("%w: parse %s: %v", ErrBadPrep, path, err)
	}
	switch {
	case p.Version != prepVersion:
		return Prep{}, fmt.Errorf("%w: %s has version %d, want %d", ErrBadPrep, path, p.Version, prepVersion)
	case p.JobID == "":
		return Prep{}, fmt.Errorf("%w: %s names no seed job", ErrBadPrep, path)
	case !ValidMode(p.Mode):
		return Prep{}, fmt.Errorf("%w: %s has unknown mode %q", ErrBadPrep, path, p.Mode)
	case len(p.QuestionIDs) == 0:
		return Prep{}, fmt.Errorf("%w: %s holds no questions", ErrBadPrep, path)
	case p.DurationSeconds < 0:
		return Prep{}, fmt.Errorf("%w: %s has a negative duration", ErrBadPrep, path)
	case p.Ready && p.ReadyAt == nil:
		return Prep{}, fmt.Errorf("%w: %s is ready with no readyAt", ErrBadPrep, path)
	}
	return p, nil
}

func RemovePrep(path string) error {
	if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("session: remove %s: %w", path, err)
	}
	return nil
}
