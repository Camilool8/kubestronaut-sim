package api_test

import (
	"net/http"
	"testing"
	"time"

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
