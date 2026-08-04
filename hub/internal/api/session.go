package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"

	"kubestronaut-sim/hub/internal/session"
)

// maxBody bounds a control request body. These are a few dozen bytes of
// JSON; anything larger is not a client this hub has.
const maxBody = 1 << 20

func withTarget(r *http.Request, target *url.URL) context.Context {
	return context.WithValue(r.Context(), targetKey{}, target)
}

// handleSessionStart is admission, and then the facilitator's own start.
//
// The two are separate events separated by minutes: admission grants a
// seat and begins a Pod boot, and only once that Pod answers can the
// attempt itself begin. The SPA already polls this endpoint, so the
// intermediate answers are 202 (yours is starting) and 409 (nobody's
// is), and the final one is whatever the facilitator says.
func (s *Server) handleSessionStart(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	// Read it before doing anything else: on the ready path this exact
	// body has to reach the facilitator, and a proxied request whose
	// body was already consumed starts an attempt with no options set.
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBody))
	if err != nil {
		writeError(w, http.StatusBadRequest, "could not read the request body")
		return
	}

	var wanted struct {
		Kind string `json:"kind"`
	}
	// A body is optional here, exactly as it is for the facilitator.
	_ = json.Unmarshal(body, &wanted)
	kind := s.DefaultKind
	if wanted.Kind != "" {
		k, err := session.ParseKind(wanted.Kind)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		kind = k
	}

	live, err := s.Sessions.Start(r.Context(), user.UserID, kind)
	var queued *session.Queued
	switch {
	case errors.As(err, &queued):
		writeJSON(w, http.StatusConflict, map[string]any{
			"error":    queued.Error(),
			"queued":   true,
			"position": queued.Position,
			"seats":    queued.Seats,
			"kind":     string(queued.Kind),
		})
		return
	case errors.Is(err, session.ErrNoSuchKind):
		writeError(w, http.StatusBadRequest, err.Error())
		return
	case err != nil:
		s.logf("hub: start for %s: %v", user.UserID, err)
		writeError(w, http.StatusInternalServerError, "could not start a session")
		return
	}

	if live.State == session.Failed {
		writeJSON(w, http.StatusBadGateway, map[string]any{
			"error":  "your exam environment failed to start",
			"state":  live.State,
			"detail": live.Error,
		})
		return
	}
	if live.Addr() == "" {
		w.Header().Set("Retry-After", "5")
		writeJSON(w, http.StatusAccepted, map[string]any{
			"starting": true,
			"state":    live.State,
			"kind":     string(live.Kind),
		})
		return
	}

	s.Sessions.Touch(user.UserID)
	r.Body = io.NopCloser(bytes.NewReader(body))
	r.ContentLength = int64(len(body))
	s.proxy.ServeHTTP(w, r.WithContext(withTarget(r, &url.URL{Scheme: "http", Host: live.Addr()})))
}

// handleSessionEnd gives up the seat and the Pod.
//
// Deliberately not POST /api/session/end: that is the facilitator's, and
// it ends the *attempt* — grading it, writing its history — while the
// environment stays up so the candidate can read their score. Ending the
// seat is a different act and gets a different path, or the two would be
// impossible to tell apart and a candidate would lose their results by
// clicking the wrong one.
func (s *Server) handleSessionEnd(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	err := s.Sessions.End(r.Context(), user.UserID)
	if err != nil && !errors.Is(err, session.ErrNoSession) {
		s.logf("hub: end for %s: %v", user.UserID, err)
		writeError(w, http.StatusInternalServerError, "could not end your session")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleReset(w http.ResponseWriter, r *http.Request) {
	s.recycle(w, r, "")
}

func (s *Server) handleSwitch(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Bank string `json:"bank"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxBody)).Decode(&body); err != nil || body.Bank == "" {
		writeError(w, http.StatusBadRequest, "body must be JSON with a non-empty \"bank\"")
		return
	}
	s.recycle(w, r, body.Bank)
}

// recycle answers reset and switch in the conductor's 202-plus-job
// shape, which is what lets ControlProgress render hosted and local
// alike with no branch.
func (s *Server) recycle(w http.ResponseWriter, r *http.Request, bank string) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	job, err := s.Sessions.Recycle(user.UserID, bank)
	switch {
	case errors.Is(err, session.ErrNoSession):
		writeError(w, http.StatusNotFound, "you have no session to reset")
		return
	case errors.Is(err, session.ErrBusy):
		writeError(w, http.StatusConflict, "another control operation is already running")
		return
	case err != nil:
		s.logf("hub: recycle for %s: %v", user.UserID, err)
		writeError(w, http.StatusInternalServerError, "could not start that operation")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"job": job})
}

// handleControlStatus and handleControlLog answer for the hub's own
// jobs, never the conductor's.
//
// In a session Pod the conductor produces no jobs of its own: reset and
// switch are the hub's, and reseed answers synchronously. The one
// exception is seeding a pooled bank, which the facilitator triggers
// server-to-server and whose progress would therefore be invisible here.
// No bank in the product is pooled on the hands-on side, so nothing is
// currently affected; it is recorded in docs/follow-ups.md rather than
// guessed at.
func (s *Server) handleControlStatus(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	snap, err := s.Sessions.Status(user.UserID)
	if errors.Is(err, session.ErrNoSession) {
		// Not 404: the SPA polls this to decide whether a control
		// operation is in flight, and "you have no session" is a true
		// and useful answer to that question.
		writeJSON(w, http.StatusOK, session.Snapshot{})
		return
	}
	writeJSON(w, http.StatusOK, snap)
}

func (s *Server) handleControlLog(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	id, lines, err := s.Sessions.Log(user.UserID)
	if errors.Is(err, session.ErrNoSession) {
		writeJSON(w, http.StatusOK, map[string]any{"jobId": "", "lines": []string{}})
		return
	}
	if lines == nil {
		lines = []string{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"jobId": id, "lines": lines})
}
