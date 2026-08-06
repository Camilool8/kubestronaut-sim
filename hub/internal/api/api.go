package api

import (
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"net/http/httputil"
	"time"

	"kubestronaut-sim/hub/internal/auth"
	"kubestronaut-sim/hub/internal/catalog"
	"kubestronaut-sim/hub/internal/session"
	"kubestronaut-sim/hub/internal/store"
)

const stateCookie = "kubestronaut_oauth_state"

type Server struct {
	Auth  *auth.Authenticator
	Store *store.Store

	Sessions *session.Manager

	DefaultKind session.Kind

	Banks *catalog.Catalog

	BaseURL string

	Ingest *auth.Signer

	UI   fs.FS
	Logf func(string, ...any)

	proxy *httputil.ReverseProxy
}

func (s *Server) logf(format string, args ...any) {
	if s.Logf != nil {
		s.Logf(format, args...)
		return
	}
	log.Printf(format, args...)
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Write([]byte("ok"))
	})

	mux.HandleFunc("GET /api/me", s.handleMe)

	mux.HandleFunc("GET /api/history", s.handleHistory)
	mux.HandleFunc("DELETE /api/history", s.handleHistoryDelete)
	mux.HandleFunc("GET /api/history/export", s.handleHistoryExport)
	mux.HandleFunc("POST /api/history/import", s.handleHistoryImport)
	mux.HandleFunc("GET /api/history/summary", s.handleHistorySummary)
	mux.HandleFunc("GET /api/history/{attempt}", s.handleAttempt)

	mux.HandleFunc("GET /hub/exams", s.handleExams)

	mux.HandleFunc("GET /hub/auth/login", s.handleLogin)
	mux.HandleFunc("GET /hub/auth/callback", s.handleCallback)
	mux.HandleFunc("POST /hub/auth/logout", s.handleLogout)

	if s.Ingest != nil {
		mux.HandleFunc("POST /hub/ingest/history", s.handleIngestHistory)
	}

	if s.Sessions != nil {
		s.proxy = s.newProxy()

		mux.HandleFunc("POST /api/session/start", s.handleSessionStart)
		mux.HandleFunc("POST /hub/session/end", s.handleSessionEnd)

		mux.HandleFunc("POST /api/control/reset", s.handleReset)
		mux.HandleFunc("POST /api/control/switch", s.handleSwitch)
		mux.HandleFunc("GET /api/control/status", s.handleControlStatus)
		mux.HandleFunc("GET /api/control/log", s.handleControlLog)

		mux.HandleFunc("/", s.handleProxy)
	}

	return mux
}

type me struct {
	Authenticated bool    `json:"authenticated"`
	AuthMode      string  `json:"authMode"`
	User          *meUser `json:"user,omitempty"`
	LoginURL      string  `json:"loginURL,omitempty"`

	Session *session.Session `json:"session,omitempty"`
	Queue   *queueState      `json:"queue,omitempty"`
	Seats   map[string]seat  `json:"seats,omitempty"`
}

type meUser struct {
	ID    string `json:"id"`
	Login string `json:"login"`
}

type queueState struct {
	Position int `json:"position"`
}

type seat struct {
	Used  int `json:"used"`
	Total int `json:"total"`
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	body := me{AuthMode: string(s.Auth.Mode)}
	sess, err := s.Auth.Current(r)
	if err != nil {
		body.LoginURL = "/hub/auth/login"

		body.Seats = s.seats()
		writeJSON(w, http.StatusOK, body)
		return
	}
	body.Authenticated = true
	body.User = &meUser{ID: sess.UserID, Login: sess.Login}
	body.Seats = s.seats()
	if s.Sessions != nil {
		if live, err := s.Sessions.Get(sess.UserID); err == nil {
			body.Session = &live
		} else if pos := s.Sessions.Position(sess.UserID); pos > 0 {
			body.Queue = &queueState{Position: pos}
		}
	}
	writeJSON(w, http.StatusOK, body)
}

func (s *Server) seats() map[string]seat {
	if s.Sessions == nil {
		return nil
	}
	out := map[string]seat{}
	for kind, counts := range s.Sessions.Seats() {
		out[string(kind)] = seat{Used: counts[0], Total: counts[1]}
	}
	return out
}

type hubExam struct {
	catalog.Entry
	Kind string `json:"kind"`
}

func (s *Server) handleExams(w http.ResponseWriter, r *http.Request) {

	exams := []hubExam{}
	if s.Banks != nil {
		for _, e := range s.Banks.List() {
			exams = append(exams, hubExam{Entry: e, Kind: string(session.KindOf(e.ExamType))})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"exams": exams})
}

func (s *Server) bank(id string) (catalog.Entry, bool) {
	if s.Banks == nil {
		return catalog.Entry{}, false
	}
	return s.Banks.Get(id)
}

func (s *Server) handleHistory(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	hist, err := s.Store.History(sess.UserID)
	if err != nil {
		s.logf("hub: history for %s: %v", sess.UserID, err)
		writeError(w, http.StatusInternalServerError, "could not read your history")
		return
	}
	writeJSON(w, http.StatusOK, hist)
}

func (s *Server) handleAttempt(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.requireUser(w, r)
	if !ok {
		return
	}

	results, err := s.Store.Results(sess.UserID, r.PathValue("attempt"))
	switch {
	case errors.Is(err, store.ErrNotFound), errors.Is(err, store.ErrBadName):
		writeError(w, http.StatusNotFound, "no such attempt")
		return
	case err != nil:
		s.logf("hub: results for %s: %v", sess.UserID, err)
		writeError(w, http.StatusInternalServerError, "could not read that attempt")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write(results)
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if s.Auth.Mode != auth.ModeGitHub {

		writeError(w, http.StatusNotFound, "this deployment does not use GitHub login")
		return
	}
	state, err := auth.NewState()
	if err != nil {
		s.logf("hub: %v", err)
		writeError(w, http.StatusInternalServerError, "could not start login")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     stateCookie,
		Value:    state,
		Path:     "/hub/auth",
		HttpOnly: true,
		Secure:   s.Auth.Secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int((10 * time.Minute).Seconds()),
	})
	http.Redirect(w, r, s.Auth.GitHub.AuthCodeURL(state), http.StatusFound)
}

func (s *Server) handleCallback(w http.ResponseWriter, r *http.Request) {
	if s.Auth.Mode != auth.ModeGitHub {
		writeError(w, http.StatusNotFound, "this deployment does not use GitHub login")
		return
	}

	c, err := r.Cookie(stateCookie)
	if err != nil || c.Value == "" || c.Value != r.URL.Query().Get("state") {
		writeError(w, http.StatusBadRequest, "login state did not match — start again")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name: stateCookie, Value: "", Path: "/hub/auth",
		HttpOnly: true, Secure: s.Auth.Secure, SameSite: http.SameSiteLaxMode, MaxAge: -1,
	})

	code := r.URL.Query().Get("code")
	if code == "" {
		writeError(w, http.StatusBadRequest, "no authorization code")
		return
	}
	token, err := s.Auth.GitHub.Exchange(r.Context(), code)
	if err != nil {
		s.logf("hub: %v", err)
		writeError(w, http.StatusBadGateway, "GitHub refused the login")
		return
	}
	sess, err := s.Auth.GitHub.User(r.Context(), token)
	if err != nil {
		s.logf("hub: %v", err)
		writeError(w, http.StatusBadGateway, "could not read your GitHub account")
		return
	}
	if err := s.Auth.Issue(w, sess); err != nil {
		s.logf("hub: %v", err)
		writeError(w, http.StatusInternalServerError, "could not start your session")
		return
	}
	s.logf("hub: %s (%s) logged in", sess.Login, sess.UserID)
	http.Redirect(w, r, "/", http.StatusFound)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	s.Auth.Clear(w)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) requireUser(w http.ResponseWriter, r *http.Request) (auth.Session, bool) {
	sess, err := s.Auth.Current(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "not signed in")
		return auth.Session{}, false
	}
	return sess, true
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

const (
	codeEnvironmentStarting    = "environment_starting"
	codeEnvironmentUnreachable = "environment_unreachable"
	codeDesktopRequired        = "desktop_required"
)

func writeErrorCode(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]string{"error": msg, "code": code})
}
