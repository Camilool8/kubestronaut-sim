package api

import (
	"net/http"
)

func (s *Server) handleHistoryDelete(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if err := s.Store.Clear(sess.UserID); err != nil {
		s.logf("hub: clear history for %s: %v", sess.UserID, err)
		writeError(w, http.StatusInternalServerError, "could not clear your history")
		return
	}
	s.logf("hub: %s cleared their history", sess.UserID)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleHistoryExport(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	doc, err := s.Store.Document(sess.UserID)
	if err != nil {
		s.logf("hub: export for %s: %v", sess.UserID, err)
		writeError(w, http.StatusInternalServerError, "could not read your history")
		return
	}
	w.Header().Set("Content-Disposition", `attachment; filename="kubestronaut-history.json"`)
	writeJSON(w, http.StatusOK, doc)
}

func (s *Server) handleHistoryImport(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireUser(w, r); !ok {
		return
	}
	writeError(w, http.StatusNotImplemented,
		"hosted history is kept for you and cannot be imported into — every attempt here was graded here")
}

func (s *Server) handleHistorySummary(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireUser(w, r); !ok {
		return
	}
	writeError(w, http.StatusNotImplemented,
		"summary is not available in hosted mode — GET /api/history returns every attempt")
}
