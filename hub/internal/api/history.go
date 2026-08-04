package api

import (
	"net/http"
)

// The history routes the facilitator owns locally and the hub owns here.
//
// All of them, including the ones it refuses. A route left to the
// catch-all would reach the Pod's own facilitator and answer from a
// /state volume that dies with the Pod — so "clear my history" would
// clear a copy, report success, and leave every attempt in place.

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

// handleHistoryExport serves the same document GET /api/history returns,
// as a download. Same shape by construction: it is the same call.
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

// handleHistoryImport refuses, and says why.
//
// Import exists locally because local history is genuinely fragile — it
// lives in a volume that `./sim down -v` erases, so exporting before a
// wipe and importing after is the supported way to keep a record.
// Hosted history has the opposite property: it is the durable copy, kept
// outside every Pod the hub destroys. There is nothing to restore it
// from, and accepting an arbitrary attempt document would only make a
// record that survives on purpose accept entries that were never graded.
func (s *Server) handleHistoryImport(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireUser(w, r); !ok {
		return
	}
	writeError(w, http.StatusNotImplemented,
		"hosted history is kept for you and cannot be imported into — every attempt here was graded here")
}

// handleHistorySummary is the CLI's route, and the hub does not
// reimplement its aggregation. Answering it wrongly would be worse than
// not answering: the numbers would look right.
func (s *Server) handleHistorySummary(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireUser(w, r); !ok {
		return
	}
	writeError(w, http.StatusNotImplemented,
		"summary is not available in hosted mode — GET /api/history returns every attempt")
}
