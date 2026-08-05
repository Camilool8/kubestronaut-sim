// Package api is the hub's HTTP surface: the handful of routes it
// answers itself. Everything it does not answer belongs to the user's
// session Pod and is proxied there.
//
// The route table is deliberately small, and GET /api/me is the reason.
// A local facilitator JSON-404s any /api/* it does not know, so the SPA
// can ask once and learn which product it is talking to — no build flag,
// no separate bundle, and `./sim up` stays byte-identical.
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

// stateCookie carries the OAuth CSRF token between the redirect to
// GitHub and the callback. Short-lived and its own cookie so it cannot
// be confused with a session.
const stateCookie = "kubestronaut_oauth_state"

// Server wires the hub's dependencies into a handler.
type Server struct {
	Auth  *auth.Authenticator
	Store *store.Store
	// Sessions is nil in the identity-only deployment the store and auth
	// packages can be exercised without: no seats, no proxy, no
	// catch-all. Every session route checks for it.
	Sessions *session.Manager
	// DefaultKind is the flavour /api/session/start admits into when the
	// request names neither an exam nor a kind.
	DefaultKind session.Kind
	// Banks is what exams this deployment offers, read at startup from
	// the index the banks image ships.
	//
	// The hub needs its own copy because of when the question is asked:
	// a candidate in the lobby is choosing a certification and has no
	// session Pod yet, so there is nothing running to ask. Nil is a
	// deployment that staged no index — the lobby then has no exams to
	// offer and falls back to offering a flavour, which is what it did
	// before exams were choosable.
	Banks *catalog.Catalog
	// BaseURL is where a browser reaches the hub, used to build the
	// OAuth redirect back to it.
	BaseURL string
	// Ingest verifies the tickets session Pods post graded attempts
	// with. A DIFFERENT signer from Auth's, over a derived key, so a
	// ticket lifted from a Pod spec is not a login — see auth.Derive.
	// Nil leaves the route unregistered.
	Ingest *auth.Signer
	// UI is the SPA the hub serves for itself, in the window before a
	// candidate has a session Pod to be proxied to. Nil answers those
	// requests with the JSON errors alone, which is what every route
	// here did before there was a shell to serve. See shell.go.
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

// Handler returns the hub's routes.
//
// Two kinds of route live here and the distinction is the whole design.
// The hub ANSWERS identity, history, admission and the control
// operations that replace a Pod — everything whose truth outlives a
// session. It PROXIES the rest to the candidate's own Pod, where the
// facilitator is unchanged and unaware any of this exists.
//
// Go's mux resolves most-specific-first, so registering "/" as the
// catch-all does not shadow anything above it.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Write([]byte("ok"))
	})

	mux.HandleFunc("GET /api/me", s.handleMe)

	// Every /api/history route is answered here, none are proxied. A
	// split — some from the hub's store, some from the Pod's ephemeral
	// one — would give two different answers to the same question
	// depending on the path, and the Pod's answer is always the one that
	// is about to be destroyed.
	mux.HandleFunc("GET /api/history", s.handleHistory)
	mux.HandleFunc("DELETE /api/history", s.handleHistoryDelete)
	mux.HandleFunc("GET /api/history/export", s.handleHistoryExport)
	mux.HandleFunc("POST /api/history/import", s.handleHistoryImport)
	mux.HandleFunc("GET /api/history/summary", s.handleHistorySummary)
	mux.HandleFunc("GET /api/history/{attempt}", s.handleAttempt)

	// The exam list, for the lobby.
	//
	// Under /hub/ and not /api/ for the reason the whole route table is
	// split that way: /api/ is the candidate's session surface, and
	// everything under it is either answered on their behalf or proxied
	// to their Pod. This is a question about the deployment that has to
	// be answerable when they have no Pod at all — which is precisely
	// when they are asking it. A local `./sim up` JSON-404s it, exactly
	// as it does /api/me, so the SPA can tell the two products apart.
	mux.HandleFunc("GET /hub/exams", s.handleExams)

	mux.HandleFunc("GET /hub/auth/login", s.handleLogin)
	mux.HandleFunc("GET /hub/auth/callback", s.handleCallback)
	mux.HandleFunc("POST /hub/auth/logout", s.handleLogout)

	// Under /hub/, not /api/, and deliberately: /api/ is the candidate's
	// surface and everything under it is proxied or answered on their
	// behalf. This is the session Pod talking to the hub about them, and
	// it authenticates as the Pod, not as them.
	if s.Ingest != nil {
		mux.HandleFunc("POST /hub/ingest/history", s.handleIngestHistory)
	}

	if s.Sessions != nil {
		s.proxy = s.newProxy()

		// Admission. The facilitator's own POST /api/session/start still
		// runs — it is what actually begins an attempt — but only after
		// this has granted a seat and the Pod is up, and the request is
		// then forwarded there unchanged.
		mux.HandleFunc("POST /api/session/start", s.handleSessionStart)
		mux.HandleFunc("POST /hub/session/end", s.handleSessionEnd)

		// Reset and switch are Pod replacement here, not in-place
		// rebuilds, so the hub owns them and the job they report.
		mux.HandleFunc("POST /api/control/reset", s.handleReset)
		mux.HandleFunc("POST /api/control/switch", s.handleSwitch)
		mux.HandleFunc("GET /api/control/status", s.handleControlStatus)
		mux.HandleFunc("GET /api/control/log", s.handleControlLog)

		mux.HandleFunc("/", s.handleProxy)
	}

	return mux
}

// me is the hosted-mode probe. It answers 200 whether or not anyone is
// logged in, on purpose: the SPA is asking "am I talking to a hub?", and
// a 401 would conflate "hosted, logged out" with "not hosted at all".
type me struct {
	Authenticated bool    `json:"authenticated"`
	AuthMode      string  `json:"authMode"`
	User          *meUser `json:"user,omitempty"`
	LoginURL      string  `json:"loginURL,omitempty"`

	// Session and Queue are what the header chip and the queue dialog
	// render. Both omitted when there is nothing to say, so the SPA can
	// treat their presence as the question's answer.
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
		// Seat counts before login on purpose: someone deciding whether
		// to sign in is entitled to know whether there is anywhere to
		// sit. It is a capacity number, not a fact about anyone.
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

// hubExam is one exam as the lobby renders it: the catalog row plus the
// seat pool its engine draws from.
//
// `kind` is derived here rather than in the browser because it is the
// hub's rule, not a display detail — it decides which seat pool a click
// on this card competes for, and the same mapping (session.KindOf) is
// what admission and the seat guard use. Two independent derivations of
// it would be two places to get it wrong.
type hubExam struct {
	catalog.Entry
	Kind string `json:"kind"`
}

// handleExams answers the lobby's exam list.
//
// Unauthenticated on purpose, like the seat counts beside it on
// /api/me: what a deployment offers is not a fact about anybody, and
// somebody deciding whether to sign in is entitled to see whether the
// certification they came for is here.
func (s *Server) handleExams(w http.ResponseWriter, r *http.Request) {
	// Never null: an empty list has to marshal as [] so the lobby renders
	// "no exams" rather than crashing on it.
	exams := []hubExam{}
	if s.Banks != nil {
		for _, e := range s.Banks.List() {
			exams = append(exams, hubExam{Entry: e, Kind: string(session.KindOf(e.ExamType))})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"exams": exams})
}

// bank looks an exam up, answering false for a deployment that staged no
// index. Refusing there is deliberate: a hub that cannot tell whether a
// bank exists must not stamp the name into a Pod and find out over the
// twenty minutes it takes to boot one.
func (s *Server) bank(id string) (catalog.Entry, bool) {
	if s.Banks == nil {
		return catalog.Entry{}, false
	}
	return s.Banks.Get(id)
}

// handleHistory serves the user's attempts in the exact shape the
// facilitator's own /api/history returns — most recent first, with the
// cross-attempt rollup beside them — so Progress.tsx needs no
// hosted-mode branch.
//
// Not store.Document: that is the interchange format an export writes,
// and it is oldest-first with no summary. The dashboard reads
// `summary.weakDomains` unconditionally, so serving the document here
// gives a blank screen rather than a wrong one.
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
	// Scoped to the caller's own user directory, so an attempt ID
	// belonging to someone else is simply not found rather than served.
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
		// In header and none modes there is nothing to log in to; saying
		// so beats redirecting to an OAuth app that does not exist.
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
	// The state check is the CSRF defence, and it comes first: without
	// it an attacker can complete a login flow in someone else's browser
	// and have them signed in as the attacker.
	c, err := r.Cookie(stateCookie)
	if err != nil || c.Value == "" || c.Value != r.URL.Query().Get("state") {
		writeError(w, http.StatusBadRequest, "login state did not match — start again")
		return
	}
	// Spent, whatever happens next.
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

// requireUser writes a 401 and reports false when nobody is logged in.
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

// Error codes on the proxy's own answers.
//
// The `error` field is a sentence for a person and stays that way. These
// are for the SPA, which has to tell an expected wait from a fault and
// must not do it by matching prose — the copy is a UI string living in a
// Go file, and it will be reworded by someone with no idea a client is
// parsing it.
const (
	codeEnvironmentStarting    = "environment_starting"
	codeEnvironmentUnreachable = "environment_unreachable"
	// The caller's own device cannot run the exam it asked for. Coded
	// because the SPA answers it with a screen rather than a toast, and
	// because it is the one refusal here that is not about the server.
	codeDesktopRequired = "desktop_required"
)

func writeErrorCode(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]string{"error": msg, "code": code})
}
