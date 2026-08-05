package api_test

import (
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"
	"time"

	"kubestronaut-sim/facilitator/internal/api"
	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/session"
)

const tipsBody = "# Exam tips\n\nGenerate the manifest, do not type it.\n"

// bankWithTips copies the standard test bank into a temp directory and
// drops a tips.md beside its exam definition, so the tips tests exercise
// the same exam every other test here does.
func bankWithTips(t *testing.T, body string) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.CopyFS(dir, os.DirFS(bankDir)); err != nil {
		t.Fatalf("copy bank: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "tips.md"), []byte(body), 0o644); err != nil {
		t.Fatalf("write tips.md: %v", err)
	}
	return dir
}

func newTipsServer(t *testing.T, bank string) *testServer {
	t.Helper()
	ex, err := exam.Load(examJSON, bank)
	if err != nil {
		t.Fatalf("exam.Load: %v", err)
	}
	clock, setNow := fakeClock(epoch)
	mgr, err := session.New(t.TempDir()+"/session.json", ex.Name, ex.Duration, clock, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}
	grader := &fakeGrader{}
	h := api.New(ex, bank, mgr, grader.Grade, fakeDesktop, fakeControl, fstest.MapFS{}, nil, nil)
	return &testServer{handler: h, mgr: mgr, grader: grader, setNow: setNow}
}

func TestTipsAreServedVerbatimFromTheBank(t *testing.T) {
	ts := newTipsServer(t, bankWithTips(t, tipsBody))

	rec := ts.do(t, http.MethodGet, "/api/exam/tips")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/exam/tips = %d, want 200", rec.Code)
	}
	got := decodeJSON[struct {
		Markdown string `json:"markdown"`
	}](t, rec)
	if got.Markdown != tipsBody {
		t.Fatalf("markdown = %q, want the bank's file verbatim %q", got.Markdown, tipsBody)
	}
}

// The whole reason this endpoint is registered beside /api/exam rather
// than beside the solution and hint routes. Technique is not answers: it
// is how to alias kubectl and where to look when a Pod will not start,
// which is the same advice whatever mode the attempt is in — and it is
// most useful before the clock starts, when there is no attempt at all.
func TestTipsAreUngatedInEveryAttemptState(t *testing.T) {
	bank := bankWithTips(t, tipsBody)

	for _, tc := range []struct {
		name  string
		setup func(*testServer)
	}{
		{"no attempt at all", func(*testServer) {}},
		{"an exam attempt running", func(ts *testServer) {
			if _, err := ts.mgr.Start(session.ModeExam, 2*time.Hour); err != nil {
				t.Fatalf("start: %v", err)
			}
		}},
		{"a speed attempt running", func(ts *testServer) {
			if _, err := ts.mgr.Start(session.ModeSpeed, time.Hour); err != nil {
				t.Fatalf("start: %v", err)
			}
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ts := newTipsServer(t, bank)
			tc.setup(ts)
			if rec := ts.do(t, http.MethodGet, "/api/exam/tips"); rec.Code != http.StatusOK {
				t.Fatalf("GET /api/exam/tips = %d, want 200 — tips are not gated", rec.Code)
			}
		})
	}
}

// The client is told once, on /api/exam, so it can decide whether the
// control should exist at all rather than opening an empty sheet.
func TestExamAdvertisesWhetherTheBankHasTips(t *testing.T) {
	type examResp struct {
		HasTips bool `json:"hasTips"`
	}

	with := newTipsServer(t, bankWithTips(t, tipsBody))
	if got := decodeJSON[examResp](t, with.do(t, http.MethodGet, "/api/exam")); !got.HasTips {
		t.Fatal("hasTips is false for a bank that ships tips.md")
	}

	without := newTestServer(t)
	if got := decodeJSON[examResp](t, without.do(t, http.MethodGet, "/api/exam")); got.HasTips {
		t.Fatal("hasTips is true for a bank with no tips.md")
	}
}

func TestTipsAre404ForABankThatShipsNone(t *testing.T) {
	ts := newTestServer(t)

	rec := ts.do(t, http.MethodGet, "/api/exam/tips")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("GET /api/exam/tips = %d, want 404", rec.Code)
	}
}

// An empty file would open a sheet with nothing in it, which is worse
// than no control — so it does not count as having tips.
func TestAnEmptyTipsFileIsNoTips(t *testing.T) {
	ts := newTipsServer(t, bankWithTips(t, ""))

	got := decodeJSON[struct {
		HasTips bool `json:"hasTips"`
	}](t, ts.do(t, http.MethodGet, "/api/exam"))
	if got.HasTips {
		t.Fatal("hasTips is true for an empty tips.md")
	}
}

// Read per request, exactly as question.md and solution.md are, so an
// author editing the file does not have to restart the facilitator.
func TestTipsAreReadPerRequestRatherThanCachedAtLoad(t *testing.T) {
	bank := bankWithTips(t, tipsBody)
	ts := newTipsServer(t, bank)

	edited := tipsBody + "\n## Pacing\n\nFlag it and move on.\n"
	if err := os.WriteFile(filepath.Join(bank, "tips.md"), []byte(edited), 0o644); err != nil {
		t.Fatalf("rewrite tips.md: %v", err)
	}

	got := decodeJSON[struct {
		Markdown string `json:"markdown"`
	}](t, ts.do(t, http.MethodGet, "/api/exam/tips"))
	if got.Markdown != edited {
		t.Fatalf("markdown = %q, want the edited file %q", got.Markdown, edited)
	}
}
