package api_test

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"kubestronaut-sim/facilitator/internal/api"
	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/session"
)

const (
	i18nExamJSON = "testdata/exam-mcq-i18n.json"
	i18nBankDir  = "testdata/bank-mcq-i18n"
)

func newI18nTestServer(t *testing.T) *testServer {
	t.Helper()

	ex, err := exam.Load(i18nExamJSON, i18nBankDir)
	if err != nil {
		t.Fatalf("exam.Load: %v", err)
	}
	clock, setNow := fakeClock(epoch)
	mgr, err := session.New(t.TempDir()+"/session.json", ex.Name, ex.Duration, clock, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}
	grader := &fakeGrader{}
	h := api.New(ex, i18nBankDir, mgr, grader.Grade, fakeDesktop, fakeControl, fstest.MapFS{}, nil, nil)
	return &testServer{handler: h, mgr: mgr, grader: grader, setNow: setNow}
}

func TestExamAdvertisesItsLanguages(t *testing.T) {
	ts := newI18nTestServer(t)

	rec := ts.doJSON(t, http.MethodGet, "/api/exam", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	var body struct {
		Language     string   `json:"language"`
		Translations []string `json:"translations"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Language != "en" || strings.Join(body.Translations, ",") != "pt" {
		t.Errorf("language/translations = %q/%v, want en/[pt]", body.Language, body.Translations)
	}

	// A bank with no translations says nothing about languages at all,
	// so a client written before they existed sees an unchanged shape.
	plain := newMCQTestServer(t, false)
	rec = plain.doJSON(t, http.MethodGet, "/api/exam", "")
	if strings.Contains(rec.Body.String(), `"translations"`) {
		t.Errorf("a bank without translations advertised some: %s", rec.Body.String())
	}
}

func TestStartRefusesALanguageTheBankLacks(t *testing.T) {
	ts := newI18nTestServer(t)

	rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam","language":"de"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("start in de: status = %d, want 400; body=%s", rec.Code, rec.Body.String())
	}
	if ts.mgr.Snapshot().State != "idle" {
		t.Errorf("a refused start moved the session to %q", ts.mgr.Snapshot().State)
	}
}

func TestAttemptInATranslationServesTranslatedQuestionAndSolution(t *testing.T) {
	ts := newI18nTestServer(t)

	rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"training","language":"pt"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("start: status = %d, body=%s", rec.Code, rec.Body.String())
	}
	var started struct {
		Language string `json:"language"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &started); err != nil {
		t.Fatal(err)
	}
	if started.Language != "pt" {
		t.Errorf("start response language = %q, want pt", started.Language)
	}

	rec = ts.doJSON(t, http.MethodGet, "/api/questions/q01", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("question: status = %d, body=%s", rec.Code, rec.Body.String())
	}
	var q struct {
		Markdown string   `json:"markdown"`
		Options  []string `json:"options"`
		Language string   `json:"language"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &q); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(q.Markdown, "letra grega") {
		t.Errorf("question markdown is not the pt stem: %q", q.Markdown)
	}
	if strings.Join(q.Options, "|") != "Alfa|Bravo|Charlie" {
		t.Errorf("options = %v, want the pt options in exam.yaml's order", q.Options)
	}
	if q.Language != "pt" {
		t.Errorf("question language = %q, want pt", q.Language)
	}
	if strings.Contains(rec.Body.String(), `"correct"`) {
		t.Errorf("the key leaked with the translated question: %s", rec.Body.String())
	}

	// The index is what is stored, and it means the same in every language.
	rec = ts.doJSON(t, http.MethodPut, "/api/questions/q01/answer", `{"selected":[1]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("answer: status = %d, body=%s", rec.Code, rec.Body.String())
	}

	// Training allows the solution mid-attempt; it comes back translated.
	rec = ts.doJSON(t, http.MethodGet, "/api/questions/q01/solution", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("solution: status = %d, body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "resposta correta") {
		t.Errorf("solution is not the pt explanation: %s", rec.Body.String())
	}
}

func TestAttemptLanguageSurvivesAResume(t *testing.T) {
	ts := newI18nTestServer(t)
	rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam","language":"pt"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("start: status = %d, body=%s", rec.Code, rec.Body.String())
	}
	if got := ts.mgr.Snapshot().Language; got != "pt" {
		t.Fatalf("snapshot language = %q, want pt", got)
	}

	rec = ts.doJSON(t, http.MethodGet, "/api/session", "")
	if !strings.Contains(rec.Body.String(), `"language":"pt"`) {
		t.Errorf("GET /api/session does not carry the language: %s", rec.Body.String())
	}
}

func TestStartInTheBaseLanguageIsTheDefault(t *testing.T) {
	ts := newI18nTestServer(t)
	rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam","language":"en"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("start: status = %d, body=%s", rec.Code, rec.Body.String())
	}
	if got := ts.mgr.Snapshot().Language; got != "" {
		t.Errorf("asking for the base language stored %q, want empty", got)
	}
	rec = ts.doJSON(t, http.MethodGet, "/api/questions/q01", "")
	if !strings.Contains(rec.Body.String(), "Which option is Bravo") {
		t.Errorf("base-language question is not question.md: %s", rec.Body.String())
	}
}

func TestLoadRefusesAnIncompleteTranslation(t *testing.T) {
	dir := t.TempDir()
	bank := filepath.Join(dir, "bank")
	if err := os.CopyFS(bank, os.DirFS(i18nBankDir)); err != nil {
		t.Fatal(err)
	}

	// One question loses its file: the load fails, naming it.
	if err := os.Remove(filepath.Join(bank, "q02", "i18n", "pt.md")); err != nil {
		t.Fatal(err)
	}
	_, err := exam.Load(i18nExamJSON, bank)
	if err == nil || !strings.Contains(err.Error(), "q02") {
		t.Fatalf("load with q02/i18n/pt.md missing: err = %v, want one naming q02", err)
	}

	// An option count that disagrees with exam.yaml fails too — a stored
	// answer index would otherwise mean different things per language.
	short := "## Question\n\nx\n\n## Options\n\n- só uma\n\n## Solution\n\n" + strings.Repeat("y", 210) + "\n"
	if err := os.WriteFile(filepath.Join(bank, "q02", "i18n", "pt.md"), []byte(short), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err = exam.Load(i18nExamJSON, bank)
	if err == nil || !strings.Contains(err.Error(), "options") {
		t.Fatalf("load with a 1-option translation: err = %v, want an option-count error", err)
	}
}
