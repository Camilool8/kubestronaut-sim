package api

import (
	"errors"
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"

	"kubestronaut-sim/hub/internal/session"
)

// newProxy builds the reverse proxy that carries everything the hub does
// not answer itself: the SPA, every /api/* route the facilitator owns,
// and the desktop's WebSocket.
//
// httputil.ReverseProxy handles the upgrade correctly — on a 101 it
// hijacks and splices the two connections — which is why this is a
// ReverseProxy and not a hand-written pipe. FlushInterval matters
// separately: the facilitator streams, and buffering a stream until it
// ends is indistinguishable from a hang.
func (s *Server) newProxy() *httputil.ReverseProxy {
	return &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			// The target is per-request because it is per-user: each
			// candidate's traffic goes to their own Pod, resolved from
			// their cookie by the handler below.
			target := r.In.Context().Value(targetKey{}).(*url.URL)
			r.Out.URL.Scheme = target.Scheme
			r.Out.URL.Host = target.Host
			r.Out.Host = target.Host
			// Deliberately NOT SetXForwarded: the facilitator has no
			// notion of a forwarded identity, and sending X-Forwarded-*
			// into a process that trusts its inputs is how a header the
			// hub uses for auth becomes one a candidate can set.
		},
		// -1 flushes immediately. A WebSocket is bidirectional and
		// message-paced; any buffering at all makes the desktop feel
		// broken.
		FlushInterval: -1,
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			s.logf("hub: proxy %s: %v", r.URL.Path, err)
			writeErrorCode(w, http.StatusBadGateway, codeEnvironmentUnreachable,
				"your exam environment is not reachable right now")
		},
		Transport: &http.Transport{
			// No idle timeout on the desktop stream, but a bound on how
			// long a Pod may take to answer at all.
			ResponseHeaderTimeout: 60 * time.Second,
			MaxIdleConnsPerHost:   8,
		},
	}
}

// targetKey carries the resolved upstream from the handler to Rewrite.
type targetKey struct{}

// handleProxy is the catch-all: anything the hub's own mux did not
// claim belongs to the candidate's session — once there is one. Until
// then it belongs to the shell, because the screens that start a session
// are part of the app being asked for. Each of the three ways there can
// be nothing to proxy to serves the shell to a browser and keeps its
// JSON to everything else; see wantsShell.
func (s *Server) handleProxy(w http.ResponseWriter, r *http.Request) {
	sess, err := s.Auth.Current(r)
	if err != nil {
		// The most important of the three: this is a first visit. The
		// sign-in screen is in the bundle below, and a JSON 401 here is
		// the whole product being unreachable.
		if s.wantsShell(r) {
			s.serveShell(w, r)
			return
		}
		writeError(w, http.StatusUnauthorized, "not signed in")
		return
	}
	live, err := s.Sessions.Get(sess.UserID)
	if errors.Is(err, session.ErrNoSession) {
		// 404, not 502: there is nothing wrong, the candidate simply has
		// no session yet. They are signed in, so this is the lobby.
		if s.wantsShell(r) {
			s.serveShell(w, r)
			return
		}
		writeError(w, http.StatusNotFound, "you have no session running — start one first")
		return
	}
	if err != nil {
		// Not diverted to the shell on purpose: something is actually
		// broken, and an app that renders over it would poll a hub that
		// cannot answer instead of showing what happened.
		writeError(w, http.StatusInternalServerError, "could not find your session")
		return
	}
	if live.Addr() == "" {
		// 503 with Retry-After, because the answer really is "ask again":
		// the Pod is booting and the SPA polls. A candidate who reloads
		// mid-boot still needs the app back, hence the shell.
		if s.wantsShell(r) {
			s.serveShell(w, r)
			return
		}
		w.Header().Set("Retry-After", "5")
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"error": "your exam environment is still starting",
			"code":  codeEnvironmentStarting,
			"state": live.State,
		})
		return
	}

	s.Sessions.Touch(sess.UserID)
	target := &url.URL{Scheme: "http", Host: live.Addr()}
	s.proxy.ServeHTTP(w, r.WithContext(withTarget(r, target)))
}
