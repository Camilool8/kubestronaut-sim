package api_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"kubestronaut-sim/facilitator/internal/api"
	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/history"
	"kubestronaut-sim/facilitator/internal/session"
)

type historyServer struct {
	handler http.Handler
	store   *history.Store
}

type banksFunc func(ctx context.Context) ([]byte, error)

func newHistoryServer(t *testing.T, banks banksFunc) *historyServer {
	t.Helper()

	ex, err := exam.Load(examJSON, bankDir)
	if err != nil {
		t.Fatalf("exam.Load: %v", err)
	}
	clock, _ := fakeClock(epoch)
	mgr, err := session.New(filepath.Join(t.TempDir(), "session.json"), ex.Name, ex.Duration, clock, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}
	store, err := history.Open(filepath.Join(t.TempDir(), "history.json"))
	if err != nil {
		t.Fatalf("history.Open: %v", err)
	}

	opts := []api.Option{api.WithHistory(store)}
	if banks != nil {
		opts = append(opts, api.WithBanks(api.BanksFetcher(banks)))
	}
	h := api.New(ex, bankDir, mgr, func() {}, fakeDesktop, fakeControl, fstest.MapFS{}, nil, nil, opts...)
	return &historyServer{handler: h, store: store}
}

func (hs *historyServer) req(t *testing.T, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, path, nil)
	} else {
		r = httptest.NewRequest(method, path, strings.NewReader(body))
	}
	w := httptest.NewRecorder()
	hs.handler.ServeHTTP(w, r)
	return w
}

func attempt(id, bank, cert string, at time.Time, percent int, counted bool) history.Record {
	return history.Record{
		ID:            id,
		Bank:          bank,
		Certification: cert,
		ExamTitle:     cert + " Mock",
		ExamType:      "hands-on",
		Mode:          "exam",
		StartedAt:     at.Add(-time.Hour),
		GradedAt:      at,
		QuestionCount: 22,
		Earned:        percent,
		Total:         100,
		Percent:       percent,
		PassingScore:  66,
		Passed:        percent >= 66,
		Counted:       counted,
		Domains: []history.DomainResult{
			{Domain: "Domain One", Earned: percent / 2, Total: 50, WeightPct: 50, QuestionCount: 1},
		},
	}
}

func TestHistoryGetEmpty(t *testing.T) {
	hs := newHistoryServer(t, nil)
	w := hs.req(t, http.MethodGet, "/api/history", "")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	if !strings.Contains(w.Body.String(), `"attempts":[]`) {
		t.Errorf("body = %s, want an empty attempts array", w.Body.String())
	}

	var got struct {
		Attempts []history.Record `json:"attempts"`
		Summary  history.Summary  `json:"summary"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Summary.TrackCount != 5 {
		t.Errorf("summary.trackCount = %d, want 5", got.Summary.TrackCount)
	}
}

func TestHistoryGetIsMostRecentFirst(t *testing.T) {
	hs := newHistoryServer(t, nil)
	hs.store.Add(attempt("old", "test-bank", "CKAD", epoch, 50, true))
	hs.store.Add(attempt("new", "test-bank", "CKAD", epoch.Add(time.Hour), 80, true))

	w := hs.req(t, http.MethodGet, "/api/history", "")
	var got struct {
		Attempts []history.Record `json:"attempts"`
	}
	json.Unmarshal(w.Body.Bytes(), &got)
	if len(got.Attempts) != 2 || got.Attempts[0].ID != "new" {
		t.Fatalf("attempts = %#v, want [new, old]", got.Attempts)
	}
}

func TestHistoryDelete(t *testing.T) {
	hs := newHistoryServer(t, nil)
	hs.store.Add(attempt("a1", "test-bank", "CKAD", epoch, 80, true))

	w := hs.req(t, http.MethodDelete, "/api/history", "")
	if w.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", w.Code)
	}
	if got := len(hs.store.All()); got != 0 {
		t.Errorf("store still holds %d records", got)
	}
}

func TestHistorySummary(t *testing.T) {
	hs := newHistoryServer(t, nil)
	hs.store.Add(attempt("a1", "ckad-mock-01", "CKAD", epoch, 80, true))
	hs.store.Add(attempt("a2", "kcna-mock", "KCNA", epoch.Add(time.Hour), 20, true))

	w := hs.req(t, http.MethodGet, "/api/history/summary", "")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var got history.Summary
	json.Unmarshal(w.Body.Bytes(), &got)
	if got.Attempts != 2 || got.PassedCount != 1 || got.TrackCount != 5 {
		t.Errorf("summary = %+v, want 2 attempts / 1 passed / 5 track", got)
	}
	if len(got.WeakDomains) != 1 || got.WeakDomains[0].Domain != "Domain One" {
		t.Errorf("weakDomains = %#v", got.WeakDomains)
	}
}

func TestHistoryExportNamesTheFile(t *testing.T) {
	hs := newHistoryServer(t, nil)
	hs.store.Add(attempt("a1", "test-bank", "CKAD", epoch, 80, true))

	w := hs.req(t, http.MethodGet, "/api/history/export", "")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	cd := w.Header().Get("Content-Disposition")
	if !strings.HasPrefix(cd, "attachment; filename=") || !strings.Contains(cd, "kubestronaut-sim-history-") {
		t.Errorf("Content-Disposition = %q, want a named attachment", cd)
	}

	var doc history.Document
	if err := json.Unmarshal(w.Body.Bytes(), &doc); err != nil {
		t.Fatalf("export is not a history document: %v", err)
	}
	if len(doc.Attempts) != 1 || doc.Attempts[0].ID != "a1" {
		t.Fatalf("export = %#v", doc)
	}
}

func TestHistoryImportMerges(t *testing.T) {
	hs := newHistoryServer(t, nil)

	hs.store.Add(attempt("since", "test-bank", "CKAD", epoch.Add(48*time.Hour), 90, true))

	doc, _ := json.Marshal(history.Document{
		Version: 1,
		Attempts: []history.Record{
			attempt("older", "test-bank", "CKAD", epoch, 40, true),
		},
	})

	w := hs.req(t, http.MethodPost, "/api/history/import", string(doc))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", w.Code, w.Body.String())
	}
	var got struct{ Imported, Skipped int }
	json.Unmarshal(w.Body.Bytes(), &got)
	if got.Imported != 1 || got.Skipped != 0 {
		t.Errorf("import = %+v, want 1 imported / 0 skipped", got)
	}
	if n := len(hs.store.All()); n != 2 {
		t.Errorf("store holds %d records, want 2 — importing a backup must not lose newer attempts", n)
	}

	w = hs.req(t, http.MethodPost, "/api/history/import", string(doc))
	json.Unmarshal(w.Body.Bytes(), &got)
	if got.Imported != 0 || got.Skipped != 1 {
		t.Errorf("second import = %+v, want 0 imported / 1 skipped", got)
	}
}

func TestHistoryImportRejectsJunkAndFutureVersions(t *testing.T) {
	hs := newHistoryServer(t, nil)

	if w := hs.req(t, http.MethodPost, "/api/history/import", "not json at all"); w.Code != http.StatusBadRequest {
		t.Errorf("junk import status = %d, want 400", w.Code)
	}
	if w := hs.req(t, http.MethodPost, "/api/history/import", `{"version":99,"attempts":[]}`); w.Code != http.StatusBadRequest {
		t.Errorf("future-version import status = %d, want 400", w.Code)
	}
	if got := len(hs.store.All()); got != 0 {
		t.Errorf("a rejected import wrote %d records", got)
	}
}

func TestHistoryWithoutAStoreIs503(t *testing.T) {
	ts := newTestServer(t)
	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/api/history"},
		{http.MethodDelete, "/api/history"},
		{http.MethodGet, "/api/history/summary"},
		{http.MethodGet, "/api/history/export"},
	} {
		w := httptest.NewRecorder()
		ts.handler.ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, nil))
		if w.Code != http.StatusServiceUnavailable {
			t.Errorf("%s %s = %d, want 503", tc.method, tc.path, w.Code)
		}
	}
}

const banksBody = `{"active":"test-bank","banks":[
  {"id":"test-bank","title":"Test Exam","certification":"TEST","examType":"hands-on","questionCount":2,"available":true},
  {"id":"kcna-mock","title":"KCNA Mock Exam","certification":"KCNA","examType":"mcq","questionCount":65,"poolCount":97,"available":true},
  {"id":"cks-mock","title":"CKS Mock Exam","certification":"CKS","examType":"hands-on","available":false,"comingSoon":true,"note":"not yet"}
]}`

func TestCatalogJoinsBanksToHistory(t *testing.T) {
	hs := newHistoryServer(t, func(context.Context) ([]byte, error) { return []byte(banksBody), nil })
	hs.store.Add(attempt("a1", "kcna-mock", "KCNA", epoch, 80, true))
	hs.store.Add(attempt("a2", "kcna-mock", "KCNA", epoch.Add(time.Hour), 40, false))

	w := hs.req(t, http.MethodGet, "/api/catalog", "")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", w.Code, w.Body.String())
	}

	var got struct {
		Active string `json:"active"`
		Exams  []struct {
			ID       string               `json:"id"`
			Title    string               `json:"title"`
			Progress history.ExamProgress `json:"progress"`
		} `json:"exams"`
		Summary history.Summary `json:"summary"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Active != "test-bank" {
		t.Errorf("active = %q, want test-bank", got.Active)
	}
	if len(got.Exams) != 3 {
		t.Fatalf("exams = %d, want 3", len(got.Exams))
	}

	if got.Exams[0].ID != "test-bank" || got.Exams[0].Title != "Test Exam" {
		t.Errorf("first row = %+v, want the flattened bank entry", got.Exams[0])
	}

	var kcna history.ExamProgress
	for _, e := range got.Exams {
		if e.ID == "kcna-mock" {
			kcna = e.Progress
		}
	}
	if kcna.Attempts != 2 || kcna.Counted != 1 {
		t.Errorf("kcna progress = %+v, want 2 attempts / 1 counted", kcna)
	}
	if kcna.BestPercent == nil || *kcna.BestPercent != 80 {
		t.Errorf("kcna bestPercent = %v, want 80", kcna.BestPercent)
	}
	if !kcna.Passed {
		t.Error("kcna passed = false, want true")
	}

	for _, e := range got.Exams {
		if e.ID == "cks-mock" && e.Progress.WeakDomains == nil {
			t.Error("an unattempted exam has a null weakDomains")
		}
	}
	if got.Summary.PassedCount != 1 {
		t.Errorf("summary.passedCount = %d, want 1", got.Summary.PassedCount)
	}
}

func TestCatalogDegradesWhenTheConductorIsUnreachable(t *testing.T) {
	hs := newHistoryServer(t, func(context.Context) ([]byte, error) {
		return nil, fmt.Errorf("dial conductor:9000: connection refused")
	})
	hs.store.Add(attempt("a1", "kcna-mock", "KCNA", epoch, 80, true))

	w := hs.req(t, http.MethodGet, "/api/catalog", "")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 — the catalog must degrade, not fail", w.Code)
	}

	var got struct {
		Active string `json:"active"`
		Exams  []struct {
			ID        string               `json:"id"`
			Title     string               `json:"title"`
			Available bool                 `json:"available"`
			Note      string               `json:"note"`
			Progress  history.ExamProgress `json:"progress"`
		} `json:"exams"`
		Summary history.Summary `json:"summary"`
	}
	json.Unmarshal(w.Body.Bytes(), &got)

	if len(got.Exams) != 2 {
		t.Fatalf("exams = %#v, want the active bank plus the one history knows", got.Exams)
	}
	if got.Exams[0].ID != "test-bank" || !got.Exams[0].Available {
		t.Errorf("first row = %+v, want the loaded bank, available", got.Exams[0])
	}
	if got.Exams[1].ID != "kcna-mock" {
		t.Fatalf("second row = %+v, want the history-only bank", got.Exams[1])
	}
	if got.Exams[1].Available {
		t.Error("a history-only row is marked available; this build cannot know that")
	}
	if got.Exams[1].Note == "" {
		t.Error("a history-only row carries no explanation of why it is unavailable")
	}
	if got.Exams[1].Progress.Attempts != 1 {
		t.Errorf("history-only row lost its progress: %+v", got.Exams[1].Progress)
	}
	if got.Summary.Attempts != 1 {
		t.Errorf("summary = %+v, want the history it still has", got.Summary)
	}
}

func TestCatalogWithoutHistory(t *testing.T) {
	ts := newTestServer(t)
	w := httptest.NewRecorder()
	ts.handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/catalog", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if !strings.Contains(w.Body.String(), `"exams":[`) {
		t.Errorf("body = %s, want an exams array", w.Body.String())
	}
}
