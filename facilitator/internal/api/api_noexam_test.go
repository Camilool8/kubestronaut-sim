package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
	"time"

	"kubestronaut-sim/facilitator/internal/api"
	"kubestronaut-sim/facilitator/internal/session"
)

func newNoExamServer(t *testing.T) http.Handler {
	t.Helper()

	mgr, err := session.New(t.TempDir()+"/session.json", "", 0, time.Now, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}
	grader := &fakeGrader{}
	return api.New(nil, "", mgr, grader.Grade, fakeDesktop, fakeControl, fstest.MapFS{}, nil, nil)
}

func doNoExam(t *testing.T, h http.Handler, method, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
	return rec
}

func TestNoExamLoadedRefusesBankRoutes(t *testing.T) {
	h := newNoExamServer(t)

	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/api/exam"},
		{http.MethodPost, "/api/session/start"},
		{http.MethodPut, "/api/session/focus"},
		{http.MethodPut, "/api/questions/q01/answer"},
	} {
		rec := doNoExam(t, h, tc.method, tc.path)
		if rec.Code != http.StatusServiceUnavailable {
			t.Errorf("%s %s: status = %d, want %d", tc.method, tc.path, rec.Code, http.StatusServiceUnavailable)
		}
		var body struct {
			Error string `json:"error"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Errorf("%s %s: body is not JSON: %v", tc.method, tc.path, err)
			continue
		}

		if body.Error == "" {
			t.Errorf("%s %s: refused with no explanation", tc.method, tc.path)
		}
	}
}

func TestNoExamLoadedHasNoQuestions(t *testing.T) {
	h := newNoExamServer(t)
	if rec := doNoExam(t, h, http.MethodGet, "/api/questions/q01"); rec.Code != http.StatusServiceUnavailable {
		t.Errorf("GET /api/questions/q01: status = %d, want %d", rec.Code, http.StatusServiceUnavailable)
	}

	for _, path := range []string{"/api/questions/q01/solution", "/api/questions/q01/hints/1"} {
		rec := doNoExam(t, h, http.MethodGet, path)
		if rec.Code == http.StatusOK {
			t.Errorf("GET %s: served content with no exam loaded", path)
		}
	}
}

func TestNoExamLoadedStillServesBankIndependentRoutes(t *testing.T) {
	h := newNoExamServer(t)

	for _, path := range []string{"/api/boot", "/api/session", "/api/answers", "/healthz"} {
		if rec := doNoExam(t, h, http.MethodGet, path); rec.Code != http.StatusOK {
			t.Errorf("GET %s: status = %d, want 200", path, rec.Code)
		}
	}
}

func TestNoExamLoadedStillServesTheCatalog(t *testing.T) {
	h := newNoExamServer(t)

	rec := doNoExam(t, h, http.MethodGet, "/api/catalog")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/catalog: status = %d, want 200", rec.Code)
	}

	var body struct {
		Active string            `json:"active"`
		Exams  []json.RawMessage `json:"exams"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("catalog body is not JSON: %v", err)
	}
	if body.Active != "" {
		t.Errorf("active = %q, want empty: nothing has been chosen yet", body.Active)
	}

	if body.Exams == nil {
		t.Error("exams marshalled as null, want []")
	}
}
