package api

import (
	"io/fs"
	"net/http"
	"strings"
)

// The shell is the SPA served by the hub itself, for every request that
// arrives before there is a session Pod to proxy to.
//
// It exists because the screens that get a candidate INTO a session —
// sign-in, the lobby, the queue, the boot progress — are screens of the
// same bundle the facilitator serves, and the facilitator only runs
// inside a session. Without this, a first-time visitor is told
// {"error":"not signed in"} in raw JSON, and the page that would have
// signed them in is inside the Pod that does not exist yet.

// wantsShell reports whether a request the proxy cannot serve should be
// answered with the app rather than a JSON error.
//
// The test is the path, deliberately not the Accept header. A browser
// asks for text/html when it navigates, but the app's own asset requests
// do not — and when nobody is signed in those assets have nowhere else to
// come from, so an Accept-based rule would serve index.html and then 401
// every script tag inside it.
//
// Everything under /api/ and /hub/ keeps its JSON contract exactly.
// Handing index.html to a fetch() call would turn a clear 401 into a JSON
// parse error somewhere else entirely, which is a worse bug than the one
// this fixes.
func (s *Server) wantsShell(r *http.Request) bool {
	if s.UI == nil {
		return false
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return false
	}
	// A WebSocket handshake is a GET, and the desktop stream is not
	// under /api/. Answering one with 200 and an HTML body fails it as
	// code 1006 — "connection closed abnormally" — which tells the
	// candidate's console nothing about the Pod still booting. The 503
	// with Retry-After that the proxy would otherwise send is the honest
	// answer, and the one the SPA's reconnect loop is written against.
	if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		return false
	}
	return !strings.HasPrefix(r.URL.Path, "/api/") && !strings.HasPrefix(r.URL.Path, "/hub/")
}

// serveShell serves the embedded UI: a real file when the request path
// names one, otherwise index.html, so a client-side route like
// /history/<id> loads the app instead of 404ing. This is the rule the
// facilitator already applies to the same bundle.
func (s *Server) serveShell(w http.ResponseWriter, r *http.Request) {
	upath := strings.TrimPrefix(r.URL.Path, "/")
	if upath == "" {
		upath = "index.html"
	}
	if f, err := s.UI.Open(upath); err == nil {
		f.Close()
		http.FileServer(http.FS(s.UI)).ServeHTTP(w, r)
		return
	}

	index, err := fs.ReadFile(s.UI, "index.html")
	if err != nil {
		http.Error(w, "index.html not found", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write(index)
}
