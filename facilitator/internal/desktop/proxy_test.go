package desktop_test

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kubestronaut-sim/facilitator/internal/desktop"
)

func hostPort(s *httptest.Server) string {
	return strings.TrimPrefix(s.URL, "http://")
}

func alwaysUnlocked() bool { return true }
func alwaysLocked() bool   { return false }

func TestProxyPathMapping(t *testing.T) {
	cases := []struct {
		name     string
		reqPath  string
		wantPath string
	}{
		{"nested asset", "/desktop/vnc.html", "/vnc.html"},
		{"root", "/desktop/", "/"},
		{"nested dir", "/desktop/app/foo.js", "/app/foo.js"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var gotPath string
			backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotPath = r.URL.Path
			}))
			defer backend.Close()

			h := desktop.New(hostPort(backend), alwaysUnlocked)
			req := httptest.NewRequest(http.MethodGet, c.reqPath, nil)
			h.ServeHTTP(httptest.NewRecorder(), req)

			if gotPath != c.wantPath {
				t.Errorf("backend saw path %q, want %q", gotPath, c.wantPath)
			}
		})
	}
}

func TestProxyPreservesQueryString(t *testing.T) {
	var gotQuery string
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
	}))
	defer backend.Close()

	h := desktop.New(hostPort(backend), alwaysUnlocked)
	const query = "autoconnect=true&resize=remote&reconnect=true&path=desktop/websockify"
	req := httptest.NewRequest(http.MethodGet, "/desktop/vnc.html?"+query, nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}
	if gotQuery != query {
		t.Errorf("backend saw query %q, want %q", gotQuery, query)
	}
}

func TestLockedRejects403WithoutBackendHit(t *testing.T) {
	cases := []struct {
		name       string
		path       string
		wantCTPfx  string
		wantStatus int
	}{
		{"html asset", "/desktop/vnc.html", "text/html", http.StatusForbidden},
		{"desktop root", "/desktop/", "text/html", http.StatusForbidden},
		{"non-html asset", "/desktop/websockify", "text/plain", http.StatusForbidden},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			hit := false
			backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				hit = true
			}))
			defer backend.Close()

			h := desktop.New(hostPort(backend), alwaysLocked)
			req := httptest.NewRequest(http.MethodGet, c.path, nil)
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, req)

			if rr.Code != c.wantStatus {
				t.Errorf("status = %d, want %d", rr.Code, c.wantStatus)
			}
			if hit {
				t.Error("backend was contacted while locked")
			}
			if ct := rr.Header().Get("Content-Type"); !strings.HasPrefix(ct, c.wantCTPfx) {
				t.Errorf("Content-Type = %q, want prefix %q", ct, c.wantCTPfx)
			}
			if !strings.Contains(strings.ToLower(rr.Body.String()), "locked") {
				t.Errorf("body = %q, want to mention being locked", rr.Body.String())
			}
		})
	}
}

func TestBareDesktopRedirects(t *testing.T) {
	for _, unlocked := range []bool{true, false} {
		name := "unlocked"
		fn := alwaysUnlocked
		if !unlocked {
			name = "locked"
			fn = alwaysLocked
		}
		t.Run(name, func(t *testing.T) {
			h := desktop.New("127.0.0.1:0", fn)
			req := httptest.NewRequest(http.MethodGet, "/desktop", nil)
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, req)

			if rr.Code != http.StatusPermanentRedirect {
				t.Errorf("status = %d, want %d", rr.Code, http.StatusPermanentRedirect)
			}
			if loc := rr.Header().Get("Location"); loc != "/desktop/" {
				t.Errorf("Location = %q, want %q", loc, "/desktop/")
			}
		})
	}
}

func TestBareDesktopRedirectPreservesQuery(t *testing.T) {
	h := desktop.New("127.0.0.1:0", alwaysUnlocked)
	req := httptest.NewRequest(http.MethodGet, "/desktop?foo=bar", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusPermanentRedirect {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusPermanentRedirect)
	}
	if loc := rr.Header().Get("Location"); loc != "/desktop/?foo=bar" {
		t.Errorf("Location = %q, want %q", loc, "/desktop/?foo=bar")
	}
}

func hijackEchoHandler(w http.ResponseWriter, r *http.Request) {
	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "no hijack support", http.StatusInternalServerError)
		return
	}
	conn, buf, err := hj.Hijack()
	if err != nil {
		return
	}
	defer conn.Close()

	buf.WriteString("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
	if err := buf.Flush(); err != nil {
		return
	}
	io.Copy(conn, buf)
}

func readStatusLineAndHeaders(t *testing.T, br *bufio.Reader) string {
	t.Helper()
	statusLine, err := br.ReadString('\n')
	if err != nil {
		t.Fatalf("read status line: %v", err)
	}
	for {
		line, err := br.ReadString('\n')
		if err != nil {
			t.Fatalf("read headers: %v", err)
		}
		if line == "\r\n" {
			break
		}
	}
	return strings.TrimRight(statusLine, "\r\n")
}

func TestUpgradePassthroughWhileUnlocked(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(hijackEchoHandler))
	defer backend.Close()

	proxy := httptest.NewServer(desktop.New(hostPort(backend), alwaysUnlocked))
	defer proxy.Close()

	conn, err := net.Dial("tcp", hostPort(proxy))
	if err != nil {
		t.Fatalf("dial proxy: %v", err)
	}
	defer conn.Close()

	fmt.Fprintf(conn, "GET /desktop/websockify HTTP/1.1\r\nHost: proxy\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n")

	br := bufio.NewReader(conn)
	statusLine := readStatusLineAndHeaders(t, br)
	if !strings.HasPrefix(statusLine, "HTTP/1.1 101") {
		t.Fatalf("status line = %q, want 101 Switching Protocols", statusLine)
	}

	const msg = "hello-through-proxy"
	if _, err := conn.Write([]byte(msg)); err != nil {
		t.Fatalf("write payload: %v", err)
	}
	buf := make([]byte, len(msg))
	if _, err := io.ReadFull(br, buf); err != nil {
		t.Fatalf("read echo: %v", err)
	}
	if string(buf) != msg {
		t.Errorf("echoed = %q, want %q", buf, msg)
	}
}

func TestUpgradeRejectedWhileLocked(t *testing.T) {
	hit := false
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hit = true
		hijackEchoHandler(w, r)
	}))
	defer backend.Close()

	proxy := httptest.NewServer(desktop.New(hostPort(backend), alwaysLocked))
	defer proxy.Close()

	conn, err := net.Dial("tcp", hostPort(proxy))
	if err != nil {
		t.Fatalf("dial proxy: %v", err)
	}
	defer conn.Close()

	fmt.Fprintf(conn, "GET /desktop/websockify HTTP/1.1\r\nHost: proxy\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n")

	br := bufio.NewReader(conn)
	statusLine := readStatusLineAndHeaders(t, br)
	if !strings.HasPrefix(statusLine, "HTTP/1.1 403") {
		t.Errorf("status line = %q, want 403 Forbidden", statusLine)
	}
	if hit {
		t.Error("backend was contacted while locked")
	}
}
