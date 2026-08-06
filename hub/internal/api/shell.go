package api

import (
	"io/fs"
	"net/http"
	"strings"
)

func (s *Server) wantsShell(r *http.Request) bool {
	if s.UI == nil {
		return false
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return false
	}

	if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		return false
	}
	return !strings.HasPrefix(r.URL.Path, "/api/") && !strings.HasPrefix(r.URL.Path, "/hub/")
}

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
