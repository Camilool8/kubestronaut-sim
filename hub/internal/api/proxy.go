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
			writeError(w, http.StatusBadGateway, "your exam environment is not reachable right now")
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
// claim belongs to the candidate's session.
func (s *Server) handleProxy(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	live, err := s.Sessions.Get(sess.UserID)
	if errors.Is(err, session.ErrNoSession) {
		// 404, not 502: there is nothing wrong, the candidate simply has
		// no session yet. The SPA's own shell is served by the hub, so
		// this is only reached for API calls made before starting.
		writeError(w, http.StatusNotFound, "you have no session running — start one first")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not find your session")
		return
	}
	if live.Addr() == "" {
		// 503 with Retry-After, because the answer really is "ask again":
		// the Pod is booting and the SPA polls.
		w.Header().Set("Retry-After", "5")
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"error": "your exam environment is still starting",
			"state": live.State,
		})
		return
	}

	s.Sessions.Touch(sess.UserID)
	target := &url.URL{Scheme: "http", Host: live.Addr()}
	s.proxy.ServeHTTP(w, r.WithContext(withTarget(r, target)))
}
