package session_test

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"kubestronaut-sim/facilitator/internal/session"
)

// DrawnIDs backs `facilitator grade`, which runs as a second process
// beside the live server. Everything below is about it staying a READER:
// it must never resume an attempt, arm a timer or write the file back.

func TestDrawnIDsReadsARunningAttemptsSubset(t *testing.T) {
	path := filepath.Join(t.TempDir(), "session.json")
	mgr, err := session.New(path, "ckad-mock-01", time.Hour, time.Now, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}
	want := []string{"q03", "q01", "q07"}
	if _, err := mgr.StartDraw(session.ModeExam, time.Hour, session.Draw{
		QuestionIDs: want, Seed: "a1b2c3", PoolDigest: "deadbeef",
	}); err != nil {
		t.Fatalf("StartDraw: %v", err)
	}

	got, err := session.DrawnIDs(path)
	if err != nil {
		t.Fatalf("DrawnIDs: %v", err)
	}
	// Draw order, not sorted: the attempt presents them in this order and
	// the scoreboard should print them in it.
	if len(got) != len(want) {
		t.Fatalf("DrawnIDs = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("DrawnIDs = %v, want %v", got, want)
		}
	}
}

// An ended attempt still names its questions. This is what makes the
// warm-restart check in tests/smoke.sh mean anything: the attempt is
// graded again after `./sim down && ./sim up`, and it has to be graded
// against the same 22 it was drawn with.
func TestDrawnIDsSurvivesTheAttemptEnding(t *testing.T) {
	path := filepath.Join(t.TempDir(), "session.json")
	mgr, err := session.New(path, "ckad-mock-01", time.Hour, time.Now, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}
	if _, err := mgr.StartDraw(session.ModeExam, time.Hour, session.Draw{
		QuestionIDs: []string{"q01", "q02"},
	}); err != nil {
		t.Fatalf("StartDraw: %v", err)
	}
	if err := mgr.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}

	got, err := session.DrawnIDs(path)
	if err != nil {
		t.Fatalf("DrawnIDs: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("DrawnIDs = %v, want the ended attempt's two ids", got)
	}
}

// Three ways of meaning "there is no attempt to scope to", all of which
// the caller turns into "grade the whole bank" rather than an error.
func TestDrawnIDsIsEmptyWithNoAttempt(t *testing.T) {
	t.Run("no file at all", func(t *testing.T) {
		got, err := session.DrawnIDs(filepath.Join(t.TempDir(), "absent.json"))
		if err != nil || len(got) != 0 {
			t.Fatalf("DrawnIDs = %v, %v; want empty and no error", got, err)
		}
	})

	t.Run("an idle session", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "session.json")
		if _, err := session.New(path, "ckad-mock-01", time.Hour, time.Now, func() {}); err != nil {
			t.Fatalf("session.New: %v", err)
		}
		got, err := session.DrawnIDs(path)
		if err != nil || len(got) != 0 {
			t.Fatalf("DrawnIDs = %v, %v; want empty and no error", got, err)
		}
	})

	t.Run("an attempt drawn before subsets existed", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "session.json")
		mgr, err := session.New(path, "ckad-mock-01", time.Hour, time.Now, func() {})
		if err != nil {
			t.Fatalf("session.New: %v", err)
		}
		if _, err := mgr.Start(session.ModeExam, time.Hour); err != nil {
			t.Fatalf("Start: %v", err)
		}
		got, err := session.DrawnIDs(path)
		if err != nil || len(got) != 0 {
			t.Fatalf("DrawnIDs = %v, %v; want empty and no error", got, err)
		}
	})
}

func TestDrawnIDsRejectsAFileItCannotParse(t *testing.T) {
	path := filepath.Join(t.TempDir(), "session.json")
	if err := os.WriteFile(path, []byte("{not json"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if _, err := session.DrawnIDs(path); err == nil {
		t.Fatal("DrawnIDs accepted an unparseable session file")
	}
}

// The reason this is a plain reader rather than a second Manager. New
// resumes, re-arms and can PERSIST an expiry correction; a scoreboard
// running beside the live server must not write to the file it is
// reading.
func TestDrawnIDsDoesNotWriteToTheFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "session.json")
	mgr, err := session.New(path, "ckad-mock-01", time.Minute, time.Now, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}
	if _, err := mgr.StartDraw(session.ModeExam, time.Minute, session.Draw{
		QuestionIDs: []string{"q01"},
	}); err != nil {
		t.Fatalf("StartDraw: %v", err)
	}
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	statBefore, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}

	if _, err := session.DrawnIDs(path); err != nil {
		t.Fatalf("DrawnIDs: %v", err)
	}

	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	statAfter, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if string(before) != string(after) {
		t.Fatal("DrawnIDs rewrote the session file")
	}
	if !statBefore.ModTime().Equal(statAfter.ModTime()) {
		t.Fatal("DrawnIDs touched the session file's mtime")
	}
}
