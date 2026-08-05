package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

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
		Bank string `json:"bank"`
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

	// A named exam decides the seat, rather than being checked against
	// one the caller also sent. The seat is a Pod template and the exam
	// is what has to run in it, so the exam is the fact and the flavour
	// is derived from it — the same direction seatCanRun enforces for a
	// switch. A client that sends both and disagrees gets the exam it
	// asked for, not a refusal about a field it should not have needed
	// to send.
	//
	// Validated against the hub's own catalog BEFORE a seat is granted:
	// an unknown bank stamped into a Pod is twenty minutes of boot
	// ending in a facilitator with no exam loaded, and the candidate
	// would have spent a seat and a place in the queue to find out.
	bank := wanted.Bank
	if bank != "" {
		entry, ok := s.bank(bank)
		if !ok {
			writeError(w, http.StatusBadRequest, "no such exam")
			return
		}
		if !entry.Available {
			writeError(w, http.StatusBadRequest, "that exam cannot be sat yet")
			return
		}
		kind = session.KindOf(entry.ExamType)
	}

	// Before Start, and that placement is the whole point: Start claims a
	// seat, and where the pool is full it takes a place in the queue. A
	// refusal after either of those has already cost the candidate — and
	// everyone behind them — something this request was never going to
	// use. See device.go.
	if refuseTouchOnlyPractical(w, r, kind) {
		return
	}

	live, err := s.Sessions.Start(r.Context(), user.UserID, kind, bank)
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
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	// The gate, and the only route that needs it: reset passes no bank,
	// and every other way into recycle would have to add one. A new
	// caller that lets a candidate name an exam has to come through here.
	if !s.seatCanRun(w, user.UserID, body.Bank) {
		return
	}
	// A switch rebuilds the environment for a named exam, which is two
	// to four destructive minutes. Refusing here saves them; the seat
	// itself was already granted to a client that could use it, so this
	// only catches a device that changed under the session — a laptop
	// closed and the tab reopened on a phone. Skipped when the hub has
	// no catalog to read the engine from: the facilitator's own start
	// gate is the backstop either way, and guessing here would refuse a
	// legitimate mcq switch.
	if entry, ok := s.bank(body.Bank); ok {
		if refuseTouchOnlyPractical(w, r, session.KindOf(entry.ExamType)) {
			return
		}
	}
	s.recycle(w, r, body.Bank)
}

// seatCanRun reports whether this candidate's seat may run the exam they
// are asking for, writing the refusal itself when it may not.
//
// A seat is now a certification, not a flavour. It is created for one
// exam — the candidate chose it in the lobby, and the Pod was stamped
// and sized for it — so the only bank it can run is its own, and the
// answer to "I want a different exam" is a new session rather than a
// rebuild of this one.
//
// That is stricter than it was, and the strictness is the point. The
// previous rule allowed any same-flavour bank, which was correct while
// the exam was a deployment value nobody chose; it is wrong now, because
// a seat sized for CKAD's two-node cluster is not a seat for CKA's
// three, and the seat pool a candidate was admitted through was the one
// their chosen exam draws from.
//
// The kind check below stays underneath it as the second line: an empty
// seat bank is possible for a session adopted from a Pod that predates
// this, and that session must not fall through to no check at all.
//
// Every uncertain answer refuses. Not knowing whether a hands-on bank is
// about to be booted into a Pod with no cluster is not a reason to try
// it and find out.
func (s *Server) seatCanRun(w http.ResponseWriter, user, bank string) bool {
	live, err := s.Sessions.Get(user)
	switch {
	case errors.Is(err, session.ErrNoSession):
		writeError(w, http.StatusNotFound, "you have no session to switch")
		return false
	case err != nil:
		s.logf("hub: seat check for %s: %v", user, err)
		writeError(w, http.StatusInternalServerError, "could not find your session")
		return false
	}
	if live.Addr() == "" {
		writeError(w, http.StatusConflict, "wait until your environment is ready before changing exams")
		return false
	}
	if live.Bank != "" {
		if bank == live.Bank {
			return true
		}
		writeError(w, http.StatusConflict,
			"this seat is for one exam — end this session and start the exam you want")
		return false
	}

	kind, found, err := s.bankKind(live.Addr(), bank)
	if err != nil {
		s.logf("hub: reading the catalog for %s: %v", user, err)
		writeError(w, http.StatusBadGateway, "could not check whether this seat can run that exam")
		return false
	}
	if !found {
		writeError(w, http.StatusNotFound, "no such exam")
		return false
	}
	if kind != live.Kind {
		writeError(w, http.StatusConflict,
			"this seat cannot run that exam — end this session and start the other kind")
		return false
	}
	return true
}

// bankKind asks a session Pod's facilitator what flavour of seat an exam
// needs. The catalog is the same document the exam picker renders, so
// the answer the hub enforces is the one the candidate was shown.
func (s *Server) bankKind(addr, bank string) (session.Kind, bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://"+addr+"/api/catalog", nil)
	if err != nil {
		return "", false, err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", false, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", false, fmt.Errorf("catalog: %s", res.Status)
	}
	var catalog struct {
		Exams []struct {
			ID       string `json:"id"`
			ExamType string `json:"examType"`
		} `json:"exams"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, maxBody)).Decode(&catalog); err != nil {
		return "", false, err
	}
	for _, e := range catalog.Exams {
		if e.ID == bank {
			return session.KindOf(e.ExamType), true, nil
		}
	}
	return "", false, nil
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

// handleControlStatus and handleControlLog answer for the hub's own jobs
// first, and for the session Pod's conductor when the hub has none
// running.
//
// The hub owns reset and switch here — they are Pod replacement, and the
// Pod they describe does not exist for most of the time they run — so
// while one of those is in flight it is the only truthful answer, and
// the Pod cannot be asked anyway. The conductor inside a session still
// has one job type of its own: `seed`, which prepares the cluster for
// the questions a pooled bank's draw picked, triggered by the
// facilitator server-to-server between the candidate pressing Start and
// their clock beginning.
//
// Without the fall-through below that seed job was invisible: the
// browser polled the hub, the hub answered from a job store the seed was
// never in, and the candidate watched a blank hold with no explanation
// for however long the setup took. docs/follow-ups.md recorded this as
// waiting for the first pooled hands-on bank.
//
// The priority is in-flight over settled. The hub's own settled job
// still wins over an idle Pod, so a FAILED reset the candidate has not
// dismissed does not vanish from under them.
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
	if !snap.Busy {
		if raw, ok := s.podControl(user.UserID, "/api/control/status"); ok {
			var pod struct {
				Busy bool `json:"busy"`
			}
			if json.Unmarshal(raw, &pod) == nil && pod.Busy {
				writeRaw(w, raw)
				return
			}
		}
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
	// Same rule as the status above, and it has to be the same rule: the
	// log pane is opened from the overlay the status put on screen, so a
	// pane reading from the other job store would be empty for exactly
	// the job somebody opened it to watch.
	if snap, statusErr := s.Sessions.Status(user.UserID); statusErr == nil && !snap.Busy {
		if raw, ok := s.podControl(user.UserID, "/api/control/log"); ok {
			var pod struct {
				JobID string `json:"jobId"`
			}
			if json.Unmarshal(raw, &pod) == nil && pod.JobID != "" {
				writeRaw(w, raw)
				return
			}
		}
	}
	if lines == nil {
		lines = []string{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"jobId": id, "lines": lines})
}

// podControl asks the candidate's own session for one of the conductor's
// control routes, returning false for anything that is not a clean 200.
//
// Deliberately quiet about failures. This is a fall-through on a polling
// route: the caller's own answer is always available and always
// truthful, so a Pod that is restarting, gone, or slow should cost a
// poll rather than an error the browser has to interpret.
func (s *Server) podControl(user, path string) ([]byte, bool) {
	live, err := s.Sessions.Get(user)
	if err != nil || live.Addr() == "" {
		return nil, false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://"+live.Addr()+path, nil)
	if err != nil {
		return nil, false
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, false
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, false
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, maxBody))
	if err != nil {
		return nil, false
	}
	return raw, true
}

// writeRaw passes a session Pod's JSON answer through untouched.
//
// Re-encoding it would mean modelling the conductor's job shape in the
// hub, which is precisely the coupling that lets the two drift: the
// overlay renders whatever the conductor sends, and the hub's only
// interest here is which of the two answers to forward.
func writeRaw(w http.ResponseWriter, raw []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(raw)
}
