package api_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"kubestronaut-sim/facilitator/internal/api"
	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/session"
)

type docsResponse struct {
	ID   string `json:"id"`
	Docs []struct {
		Label string `json:"label"`
		URL   string `json:"url"`
	} `json:"docs"`
}

type docsCountResponse struct {
	Questions []struct {
		ID        string `json:"id"`
		DocsCount int    `json:"docsCount"`
	} `json:"questions"`
}

// The bank's q01 declares two links, one of them http, which exam.loadDocs
// drops. q02 declares none.
const q01Doc = "https://kubernetes.io/docs/concepts/services-networking/ingress/"

func TestDocsListedInTraining(t *testing.T) {
	ts := newTestServer(t)
	if _, err := ts.mgr.Start(session.ModeTraining, time.Hour); err != nil {
		t.Fatalf("start: %v", err)
	}

	rec := ts.do(t, http.MethodGet, "/api/questions/q01/docs")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body)
	}

	got := decodeJSON[docsResponse](t, rec)
	if len(got.Docs) != 1 {
		t.Fatalf("docs = %d, want 1 (the http entry is dropped at load): %+v", len(got.Docs), got.Docs)
	}
	if got.Docs[0].URL != q01Doc {
		t.Errorf("url = %q, want %q", got.Docs[0].URL, q01Doc)
	}
	if got.Docs[0].Label != "Ingress path types" {
		t.Errorf("label = %q, want %q", got.Docs[0].Label, "Ingress path types")
	}
}

// Training is the only mode that hands over help, and documentation links are
// help: bank-spec keeps them off a recorded sitting so a score still means the
// candidate found the page themselves.
func TestDocsRefusedOutsideTraining(t *testing.T) {
	for _, mode := range []string{session.ModeExam, session.ModeSpeed} {
		t.Run(mode, func(t *testing.T) {
			ts := newTestServer(t)
			if _, err := ts.mgr.Start(mode, time.Hour); err != nil {
				t.Fatalf("start: %v", err)
			}

			rec := ts.do(t, http.MethodGet, "/api/questions/q01/docs")
			if rec.Code != http.StatusForbidden {
				t.Errorf("status = %d, want 403", rec.Code)
			}
		})
	}
}

func TestDocsRefusedWithNoAttempt(t *testing.T) {
	ts := newTestServer(t)

	rec := ts.do(t, http.MethodGet, "/api/questions/q01/docs")
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want 403", rec.Code)
	}
}

func TestDocsUnknownQuestion(t *testing.T) {
	ts := newTestServer(t)
	if _, err := ts.mgr.Start(session.ModeTraining, time.Hour); err != nil {
		t.Fatalf("start: %v", err)
	}

	rec := ts.do(t, http.MethodGet, "/api/questions/nope/docs")
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", rec.Code)
	}
}

func TestDocsEmptyForAQuestionWithout(t *testing.T) {
	ts := newTestServer(t)
	if _, err := ts.mgr.Start(session.ModeTraining, time.Hour); err != nil {
		t.Fatalf("start: %v", err)
	}

	rec := ts.do(t, http.MethodGet, "/api/questions/q02/docs")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := decodeJSON[docsResponse](t, rec); len(got.Docs) != 0 {
		t.Errorf("docs = %+v, want none", got.Docs)
	}
}

// The tray decides whether to render at all from this count, so it has to
// agree with what the docs endpoint will serve — including the dropped entry.
func TestExamReportsDocsCount(t *testing.T) {
	ts := newTestServer(t)

	rec := ts.do(t, http.MethodGet, "/api/exam")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	got := decodeJSON[docsCountResponse](t, rec)

	want := map[string]int{"q01": 1, "q02": 0}
	for _, q := range got.Questions {
		if w, ok := want[q.ID]; ok && q.DocsCount != w {
			t.Errorf("%s docsCount = %d, want %d", q.ID, q.DocsCount, w)
		}
	}
}

type fakeOpener struct {
	opened []string
	err    error
}

func (f *fakeOpener) Open(_ context.Context, url string) error {
	f.opened = append(f.opened, url)
	return f.err
}

func newDocsServer(t *testing.T, o api.DocsOpener) *testServer {
	t.Helper()

	ex, err := exam.Load(examJSON, bankDir)
	if err != nil {
		t.Fatalf("exam.Load: %v", err)
	}
	clock, setNow := fakeClock(epoch)
	mgr, err := session.New(t.TempDir()+"/session.json", ex.Name, ex.Duration, clock, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}
	grader := &fakeGrader{}

	opts := []api.Option{}
	if o != nil {
		opts = append(opts, api.WithDocsOpener(o))
	}
	h := api.New(ex, bankDir, mgr, grader.Grade, fakeDesktop, fakeControl, fstest.MapFS{}, nil, nil, opts...)
	return &testServer{handler: h, mgr: mgr, grader: grader, setNow: setNow}
}

func openDoc(t *testing.T, ts *testServer, id, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/questions/"+id+"/docs/open", strings.NewReader(body))
	rec := httptest.NewRecorder()
	ts.handler.ServeHTTP(rec, req)
	return rec
}

func TestDocsOpenForwardsADeclaredLink(t *testing.T) {
	opener := &fakeOpener{}
	ts := newDocsServer(t, opener)
	if _, err := ts.mgr.Start(session.ModeTraining, time.Hour); err != nil {
		t.Fatalf("start: %v", err)
	}

	rec := openDoc(t, ts, "q01", `{"url":"`+q01Doc+`"}`)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204: %s", rec.Code, rec.Body)
	}
	if len(opener.opened) != 1 || opener.opened[0] != q01Doc {
		t.Errorf("opened %v, want [%s]", opener.opened, q01Doc)
	}
}

// The security boundary. The client names a URL, so the server has to prove it
// is one this question declared — otherwise the endpoint is an arbitrary-URL
// opener pointed at a browser running on the candidate's desktop.
func TestDocsOpenRefusesAnUndeclaredURL(t *testing.T) {
	for name, url := range map[string]string{
		"another site":           "https://example.com/",
		"another question's":     "https://kubernetes.io/docs/tasks/",
		"a prefix of a real one": "https://kubernetes.io/docs/concepts/",
		"the dropped http one":   "http://kubernetes.io/docs/",
		"empty":                  "",
	} {
		t.Run(name, func(t *testing.T) {
			opener := &fakeOpener{}
			ts := newDocsServer(t, opener)
			if _, err := ts.mgr.Start(session.ModeTraining, time.Hour); err != nil {
				t.Fatalf("start: %v", err)
			}

			rec := openDoc(t, ts, "q01", `{"url":"`+url+`"}`)

			if rec.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want 400", rec.Code)
			}
			if len(opener.opened) != 0 {
				t.Errorf("opened %v; nothing should have reached the desktop", opener.opened)
			}
		})
	}
}

func TestDocsOpenRefusedOutsideTraining(t *testing.T) {
	for _, mode := range []string{session.ModeExam, session.ModeSpeed} {
		t.Run(mode, func(t *testing.T) {
			opener := &fakeOpener{}
			ts := newDocsServer(t, opener)
			if _, err := ts.mgr.Start(mode, time.Hour); err != nil {
				t.Fatalf("start: %v", err)
			}

			rec := openDoc(t, ts, "q01", `{"url":"`+q01Doc+`"}`)

			if rec.Code != http.StatusForbidden {
				t.Errorf("status = %d, want 403", rec.Code)
			}
			if len(opener.opened) != 0 {
				t.Errorf("opened %v in %s mode", opener.opened, mode)
			}
		})
	}
}

func TestDocsOpenUnknownQuestion(t *testing.T) {
	ts := newDocsServer(t, &fakeOpener{})
	if _, err := ts.mgr.Start(session.ModeTraining, time.Hour); err != nil {
		t.Fatalf("start: %v", err)
	}

	rec := openDoc(t, ts, "nope", `{"url":"`+q01Doc+`"}`)

	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", rec.Code)
	}
}

func TestDocsOpenWithoutADesktop(t *testing.T) {
	ts := newDocsServer(t, nil)
	if _, err := ts.mgr.Start(session.ModeTraining, time.Hour); err != nil {
		t.Fatalf("start: %v", err)
	}

	rec := openDoc(t, ts, "q01", `{"url":"`+q01Doc+`"}`)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", rec.Code)
	}
}

func TestDocsOpenReportsADesktopThatRefuses(t *testing.T) {
	ts := newDocsServer(t, &fakeOpener{err: errors.New("connection refused")})
	if _, err := ts.mgr.Start(session.ModeTraining, time.Hour); err != nil {
		t.Fatalf("start: %v", err)
	}

	rec := openDoc(t, ts, "q01", `{"url":"`+q01Doc+`"}`)

	if rec.Code != http.StatusBadGateway {
		t.Errorf("status = %d, want 502", rec.Code)
	}
}
