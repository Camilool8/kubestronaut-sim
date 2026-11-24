package session

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

func TestPrepPathSitsNextToTheSessionFile(t *testing.T) {
	if got := PrepPath("/session/session.json"); got != "/session/prep.json" {
		t.Errorf("PrepPath = %q, want /session/prep.json", got)
	}
}

func TestPrepRoundTrips(t *testing.T) {
	path := PrepPath(sessionPath(t))
	readyAt := time.Date(2026, 1, 1, 12, 3, 0, 0, time.UTC)
	want := Prep{
		Bank:            "ckad-mock-01",
		JobID:           "job-4",
		Mode:            ModeExam,
		DurationSeconds: 7200,
		QuestionIDs:     []string{"q03", "q01"},
		Seed:            "a1b2c3",
		PoolDigest:      "0123456789ab",
		DomainFilter:    []string{"Domain A"},
		AwaitStart:      true,
		Ready:           true,
		ReadyAt:         &readyAt,
		StartedAt:       time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC),
	}
	if err := SavePrep(path, want); err != nil {
		t.Fatalf("SavePrep: %v", err)
	}
	got, err := LoadPrep(path)
	if err != nil {
		t.Fatalf("LoadPrep: %v", err)
	}
	want.Version = prepVersion
	if !reflect.DeepEqual(got, want) {
		t.Errorf("LoadPrep = %+v, want %+v", got, want)
	}
	if got.Duration() != 2*time.Hour {
		t.Errorf("Duration = %v, want 2h", got.Duration())
	}
	if d := got.Draw(); d.Seed != "a1b2c3" || len(d.QuestionIDs) != 2 || d.QuestionIDs[0] != "q03" {
		t.Errorf("Draw = %+v, want the saved draw in its drawn order", d)
	}

	leftovers, _ := filepath.Glob(filepath.Join(filepath.Dir(path), ".prep-*.tmp"))
	if len(leftovers) != 0 {
		t.Errorf("temp files left behind: %v", leftovers)
	}
}

func TestLoadPrepRefusesAnUnusableFile(t *testing.T) {
	for name, content := range map[string]string{
		"garbage":       "{not json",
		"empty":         "",
		"other version": `{"version":2,"jobId":"job-1","mode":"exam","questionIds":["q01"]}`,
		"no job":        `{"version":1,"mode":"exam","questionIds":["q01"]}`,
		"bad mode":      `{"version":1,"jobId":"job-1","mode":"sprint","questionIds":["q01"]}`,
		"no questions":  `{"version":1,"jobId":"job-1","mode":"exam"}`,
		"ready no time": `{"version":1,"jobId":"job-1","mode":"exam","questionIds":["q01"],"ready":true}`,
	} {
		t.Run(name, func(t *testing.T) {
			path := PrepPath(sessionPath(t))
			if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
				t.Fatal(err)
			}
			if _, err := LoadPrep(path); !errors.Is(err, ErrBadPrep) {
				t.Errorf("LoadPrep = %v, want ErrBadPrep", err)
			}
		})
	}
}

func TestRemovePrepToleratesAMissingFile(t *testing.T) {
	path := PrepPath(sessionPath(t))
	if err := RemovePrep(path); err != nil {
		t.Fatalf("RemovePrep on nothing: %v", err)
	}
	if err := SavePrep(path, Prep{JobID: "job-1", Mode: ModeExam, QuestionIDs: []string{"q01"}}); err != nil {
		t.Fatal(err)
	}
	if err := RemovePrep(path); err != nil {
		t.Fatalf("RemovePrep: %v", err)
	}
	if _, err := LoadPrep(path); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("LoadPrep after remove = %v, want ErrNotExist", err)
	}
}
