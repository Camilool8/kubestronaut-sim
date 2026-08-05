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

// An environment that has not been told which exam to be.
//
// This is the state a fresh `./sim up` lands in: k8s-env rests after its
// two exam-independent phases, no cluster exists, and the facilitator is
// running with no bank loaded so it can serve the screen where one gets
// chosen. Before this existed, every route below dereferenced a nil
// *exam.Exam and the process either refused to start at all or took the
// connection down mid-response.
//
// The split being pinned: routes that need a bank say 503 and say why;
// routes that do not are unaffected; and GET /api/catalog — the one
// route that is how a bank gets chosen — answers without one.
func newNoExamServer(t *testing.T) http.Handler {
	t.Helper()

	// Empty bank id, exactly as main derives it when ACTIVE_BANK is unset.
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
		// A candidate reading this should learn what to do about it, so
		// it names the action rather than reporting a missing field.
		if body.Error == "" {
			t.Errorf("%s %s: refused with no explanation", tc.method, tc.path)
		}
	}
}

// A question route must not claim a question exists, and must not
// dereference the bank to find that out.
func TestNoExamLoadedHasNoQuestions(t *testing.T) {
	h := newNoExamServer(t)
	if rec := doNoExam(t, h, http.MethodGet, "/api/questions/q01"); rec.Code != http.StatusServiceUnavailable {
		t.Errorf("GET /api/questions/q01: status = %d, want %d", rec.Code, http.StatusServiceUnavailable)
	}
	// The solution and hint gates deliberately check session state BEFORE
	// any id lookup, so they refuse for that reason first. What matters
	// here is only that they refuse rather than panic.
	for _, path := range []string{"/api/questions/q01/solution", "/api/questions/q01/hints/1"} {
		rec := doNoExam(t, h, http.MethodGet, path)
		if rec.Code == http.StatusOK {
			t.Errorf("GET %s: served content with no exam loaded", path)
		}
	}
}

// The routes that never needed a bank keep working, because the boot
// screen and the session poller run in exactly this state.
func TestNoExamLoadedStillServesBankIndependentRoutes(t *testing.T) {
	h := newNoExamServer(t)

	for _, path := range []string{"/api/boot", "/api/session", "/api/answers", "/healthz"} {
		if rec := doNoExam(t, h, http.MethodGet, path); rec.Code != http.StatusOK {
			t.Errorf("GET %s: status = %d, want 200", path, rec.Code)
		}
	}
}

// The catalog is how an exam gets chosen, so it is the one bank-reading
// route that has to answer without a bank. With no conductor wired it
// takes the degraded path — which used to build its first row entirely
// out of the loaded exam.
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
	// Never nil: an empty catalog has to marshal as [] so the selector
	// renders an empty list rather than crashing on null.
	if body.Exams == nil {
		t.Error("exams marshalled as null, want []")
	}
}
