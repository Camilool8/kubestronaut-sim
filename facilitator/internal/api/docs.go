package api

import (
	"net/http"

	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/session"
)

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
