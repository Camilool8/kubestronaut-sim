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

const maxBody = 1 << 20

func withTarget(r *http.Request, target *url.URL) context.Context {
	return context.WithValue(r.Context(), targetKey{}, target)
}

func (s *Server) handleSessionStart(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, maxBody))
	if err != nil {
		writeError(w, http.StatusBadRequest, "could not read the request body")
		return
	}

	var wanted struct {
		Kind string `json:"kind"`
		Bank string `json:"bank"`
	}

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

	if !s.seatCanRun(w, user.UserID, body.Bank) {
		return
	}

	if entry, ok := s.bank(body.Bank); ok {
		if refuseTouchOnlyPractical(w, r, session.KindOf(entry.ExamType)) {
			return
		}
	}
	s.recycle(w, r, body.Bank)
}

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

func (s *Server) handleControlStatus(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	snap, err := s.Sessions.Status(user.UserID)
	if errors.Is(err, session.ErrNoSession) {

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

func writeRaw(w http.ResponseWriter, raw []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(raw)
}
