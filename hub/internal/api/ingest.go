package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"kubestronaut-sim/hub/internal/auth"
)

const maxIngestBody = 4 << 20

func (s *Server) handleIngestHistory(w http.ResponseWriter, r *http.Request) {
	tok, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || tok == "" {
		writeError(w, http.StatusUnauthorized, "this endpoint needs a session ticket")
		return
	}
	sess, err := s.Ingest.Decode(tok)
	if err != nil {

		if errors.Is(err, auth.ErrExpired) {
			s.logf("hub: an ingest ticket has expired; that attempt was not recorded")
		}
		writeError(w, http.StatusUnauthorized, "that ticket is not valid")
		return
	}

	var body struct {
		Record  json.RawMessage `json:"record"`
		Results json.RawMessage `json:"results"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxIngestBody)).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "body must be JSON with a \"record\"")
		return
	}
	if len(body.Record) == 0 {
		writeError(w, http.StatusBadRequest, "body has no \"record\"")
		return
	}

	added, err := s.Store.Add(sess.UserID, body.Record, body.Results)
	if err != nil {
		s.logf("hub: ingest for %s: %v", sess.UserID, err)
		writeError(w, http.StatusInternalServerError, "could not record that attempt")
		return
	}
	if added {
		s.logf("hub: recorded an attempt for %s", sess.UserID)
	}
	writeJSON(w, http.StatusOK, map[string]any{"recorded": added})
}
