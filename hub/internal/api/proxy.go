package api

import (
	"errors"
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"

	"kubestronaut-sim/hub/internal/session"
)

func (s *Server) newProxy() *httputil.ReverseProxy {
	return &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {

			target := r.In.Context().Value(targetKey{}).(*url.URL)
			r.Out.URL.Scheme = target.Scheme
			r.Out.URL.Host = target.Host
			r.Out.Host = target.Host

		},

		FlushInterval: -1,
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			s.logf("hub: proxy %s: %v", r.URL.Path, err)
			writeErrorCode(w, http.StatusBadGateway, codeEnvironmentUnreachable,
				"your exam environment is not reachable right now")
		},
		Transport: &http.Transport{

			ResponseHeaderTimeout: 60 * time.Second,
			MaxIdleConnsPerHost:   8,
		},
	}
}

type targetKey struct{}

func (s *Server) handleProxy(w http.ResponseWriter, r *http.Request) {
	sess, err := s.Auth.Current(r)
	if err != nil {

		if s.wantsShell(r) {
			s.serveShell(w, r)
			return
		}
		writeError(w, http.StatusUnauthorized, "not signed in")
		return
	}
	live, err := s.Sessions.Get(sess.UserID)
	if errors.Is(err, session.ErrNoSession) {

		if s.wantsShell(r) {
			s.serveShell(w, r)
			return
		}
		writeError(w, http.StatusNotFound, "you have no session running — start one first")
		return
	}
	if err != nil {

		writeError(w, http.StatusInternalServerError, "could not find your session")
		return
	}
	if live.Addr() == "" {

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
