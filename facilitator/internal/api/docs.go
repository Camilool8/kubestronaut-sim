package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/session"
)

// DocsOpener puts a page in front of the candidate on the exam desktop.
type DocsOpener interface {
	Open(ctx context.Context, url string) error
}

func WithDocsOpener(o DocsOpener) Option {
	return func(srv *server) { srv.docsOpener = o }
}

type docLink struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

type docsResponse struct {
	ID   string    `json:"id"`
	Docs []docLink `json:"docs"`
}

// docsForCandidate resolves the question and applies the one gate that matters:
// documentation links are help, and help is Training only. Recorded modes keep
// the gate so a score still means the candidate found the page themselves.
//
// It writes the error response itself and reports whether the caller may go on.
func (s *server) docsForCandidate(w http.ResponseWriter, r *http.Request) (exam.Question, bool) {
	snap := s.mgr.Snapshot()
	if !session.HelpAllowed(snap.Mode) {
		writeJSONError(w, http.StatusForbidden, "documentation links are available in Training mode only")
		return exam.Question{}, false
	}
	if snap.State == "idle" {
		writeJSONError(w, http.StatusForbidden, "no attempt is running")
		return exam.Question{}, false
	}

	id := r.PathValue("id")
	q, ok := s.findQuestion(id)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "unknown question "+id)
		return exam.Question{}, false
	}
	return q, true
}

func (s *server) handleDocs(w http.ResponseWriter, r *http.Request) {
	q, ok := s.docsForCandidate(w, r)
	if !ok {
		return
	}

	resp := docsResponse{ID: q.ID, Docs: make([]docLink, 0, len(q.Docs))}
	for _, d := range q.Docs {
		resp.Docs = append(resp.Docs, docLink{Label: d.Label, URL: d.URL})
	}
	writeJSON(w, http.StatusOK, resp)
}

// docsOpenBudget is the middle of three nested budgets and has to stay between
// them: above the opener's own grace, which answers a cold start in a few
// seconds, and below the 10s the UI gives a mutation. Sitting above the UI's
// would mean a desktop that is genuinely unreachable reads to the candidate as
// a timeout rather than as the refusal this returns.
const docsOpenBudget = 8 * time.Second

func (s *server) handleDocsOpen(w http.ResponseWriter, r *http.Request) {
	q, ok := s.docsForCandidate(w, r)
	if !ok {
		return
	}

	if s.docsOpener == nil {
		writeJSONError(w, http.StatusServiceUnavailable,
			"the exam desktop is not reachable, so the page cannot be opened there")
		return
	}

	var body struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "body must be JSON: {\"url\":\"https://...\"}")
		return
	}

	// The security boundary. The client names a URL, so it has to be one this
	// question declared — exact match, no parsing and no prefixes, or the
	// endpoint becomes an arbitrary-URL opener pointed at a browser running on
	// the candidate's desktop. exam.loadDocs has already dropped anything that
	// is not https, so a dropped link cannot be reached through here either.
	if !declaresDoc(q, body.URL) {
		writeJSONError(w, http.StatusBadRequest, "that page is not one of this question's documentation links")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), docsOpenBudget)
	defer cancel()

	if err := s.docsOpener.Open(ctx, body.URL); err != nil {
		writeJSONError(w, http.StatusBadGateway, "the exam desktop did not open the page: "+err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func declaresDoc(q exam.Question, url string) bool {
	if url == "" {
		return false
	}
	for _, d := range q.Docs {
		if d.URL == url {
			return true
		}
	}
	return false
}

// HTTPDocsOpener talks to the sim-opener listener in the desktop container.
type HTTPDocsOpener struct {
	addr   string
	client *http.Client
}

func NewHTTPDocsOpener(addr string) *HTTPDocsOpener {
	return &HTTPDocsOpener{
		addr:   addr,
		client: &http.Client{Timeout: docsOpenBudget},
	}
}

func (o *HTTPDocsOpener) Open(ctx context.Context, url string) error {
	payload, err := json.Marshal(map[string]string{"url": url})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://"+o.addr+"/open", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	res, err := o.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	io.Copy(io.Discard, io.LimitReader(res.Body, 4096))

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("desktop opener answered %d", res.StatusCode)
	}
	return nil
}
