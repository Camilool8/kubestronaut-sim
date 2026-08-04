package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"kubestronaut-sim/hub/internal/auth"
)

// maxIngestBody bounds one posted attempt.
//
// The record is a few hundred bytes; the results document is the large
// half — 22 questions, each with its checks and their actual/expected
// artifacts. 4 MiB is far above anything the graders produce and far
// below anything that threatens the hub.
const maxIngestBody = 4 << 20

// handleIngestHistory is how a graded attempt outlives the Pod that
// produced it.
//
// The session Pod posts here, server to server, as the facilitator
// records the attempt locally. It cannot present the candidate's cookie
// — it has never seen one, and the whole design keeps the facilitator
// ignorant of identity — so it carries a ticket the hub minted for that
// user when it created the Pod. The ticket names the user; the request
// body does not, and must not: a Pod that could name its own user could
// write into anyone's history.
func (s *Server) handleIngestHistory(w http.ResponseWriter, r *http.Request) {
	tok, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || tok == "" {
		writeError(w, http.StatusUnauthorized, "this endpoint needs a session ticket")
		return
	}
	sess, err := s.Ingest.Decode(tok)
	if err != nil {
		// Logged apart from a forgery, though answered the same: an
		// expired ticket means a Pod outlived the window it was minted
		// for and its candidate has just lost an attempt, which is worth
		// being able to find. Decode reveals nothing about an expired
		// ticket's user, so there is no id to name here.
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

	// Add is idempotent on the attempt id, so a retried delivery — which
	// is the normal way this arrives when the hub was briefly redeployed
	// — records nothing twice and reports which it was.
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
