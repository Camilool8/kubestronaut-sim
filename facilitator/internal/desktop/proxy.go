// Package desktop reverse-proxies the noVNC desktop container so the exam
// UI can iframe it same-origin, gating all access behind the exam
// session's running state.
//
// The returned handler is mounted at the "/desktop/" prefix (and "GET
// /desktop" is routed to it separately for the bare-path redirect) by the
// API layer; it works from the request's original, unstripped path,
// stripping the "/desktop" prefix itself before deciding whether to lock
// or proxy.
//
// While locked, every request is rejected with 403 and the backend is
// never dialed at all — not even to check its health. WebSocket Upgrade
// requests (noVNC's own websockify endpoint) pass straight through the
// stdlib httputil.ReverseProxy's built-in 101 Switching Protocols
// handling while unlocked, since it hijacks the client connection itself;
// this package adds nothing special for them.
package desktop

import (
	"net/http"
	"net/http/httputil"
	"strings"
)

// prefix is the path this handler is mounted under. It is stripped from
// the request path before proxying or deciding whether a locked response
// should look like an HTML page or plain text.
const prefix = "/desktop"

// New returns a handler that reverse-proxies to target (a "host:port"
// address, e.g. "desktop:6080") every request whose path is "/desktop" or
// begins with "/desktop/".
//
// unlocked reports whether the desktop may currently be used (i.e.
// whether an exam session is running); it is called once per request.
// While it returns false, the handler responds 403 without dialing
// target at all: requests whose stripped path ends in ".html" or is
// exactly "/" get a small dark HTML page saying the desktop is locked and
// to use the exam UI; every other request gets a plain-text 403.
//
// "GET /desktop" (no trailing slash) always 308-redirects to "/desktop/",
// preserving any query string, regardless of lock state.
func New(target string, unlocked func() bool) http.Handler {
	proxy := &httputil.ReverseProxy{
		FlushInterval: -1,
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.Out.URL.Scheme = "http"
			pr.Out.URL.Host = target
			pr.Out.URL.Path = stripPrefix(pr.In.URL.Path)
			pr.Out.URL.RawPath = ""
			pr.Out.Host = "" // use pr.Out.URL.Host as the outbound Host header
		},
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == prefix {
			redirectToSlash(w, r)
			return
		}

		if !unlocked() {
			writeLocked(w, stripPrefix(r.URL.Path))
			return
		}

		proxy.ServeHTTP(w, r)
	})
}

// stripPrefix removes the "/desktop" mount prefix from p, the request's
// original path, returning "/" for exactly "/desktop/". If p does not
// have the prefix at all (which the handler above never actually passes
// in), it is returned unchanged.
func stripPrefix(p string) string {
	if rest, ok := strings.CutPrefix(p, prefix+"/"); ok {
		return "/" + rest
	}
	return p
}

// redirectToSlash sends a 308 permanent redirect from "/desktop" to
// "/desktop/", preserving any query string.
func redirectToSlash(w http.ResponseWriter, r *http.Request) {
	target := prefix + "/"
	if r.URL.RawQuery != "" {
		target += "?" + r.URL.RawQuery
	}
	http.Redirect(w, r, target, http.StatusPermanentRedirect)
}

// writeLocked writes the 403 response served while the desktop is locked.
// strippedPath is the request path with the "/desktop" prefix already
// removed. Paths that render as a browser navigation — the desktop root
// "/" or anything ending in ".html" — get a small dark HTML page; every
// other path (e.g. noVNC's own asset or websocket requests) gets a
// plain-text body, since nothing renders those for a human to read.
func writeLocked(w http.ResponseWriter, strippedPath string) {
	if strippedPath == "/" || strings.HasSuffix(strippedPath, ".html") {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte(lockedHTML))
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusForbidden)
	w.Write([]byte(lockedText))
}

// lockedText is the plain-text body for non-navigational locked requests.
const lockedText = "desktop locked: no exam session is running\n"

// lockedHTML is the small self-contained locked page shown for
// navigational locked requests (the desktop root or any *.html asset).
// It mirrors the SPA's design tokens (ui/src/styles/tokens.css) and
// reads the SAME localStorage theme key the React app writes — same
// origin, so a candidate's theme choice carries over seamlessly.
const lockedHTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Desktop locked</title>
<script>
  try {
    var t = localStorage.getItem("sim.theme");
    if (t === "light" || t === "dark") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {}
</script>
<style>
  :root {
    color-scheme: light;
    --bg: #f4f6f9;
    --surface: #ffffff;
    --border: #d4dae3;
    --text: #1a212b;
    --text-muted: #57626f;
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #0b0e14;
    --surface: #11151d;
    --border: #262c38;
    --text: #d9dee5;
    --text-muted: #97a0af;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]):not([data-theme="dark"]) {
      color-scheme: dark;
      --bg: #0b0e14;
      --surface: #11151d;
      --border: #262c38;
      --text: #d9dee5;
      --text-muted: #97a0af;
    }
  }
  html, body {
    height: 100%;
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: "IBM Plex Sans", system-ui, sans-serif;
  }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card {
    text-align: center;
    padding: 2rem 2.5rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    max-width: 26rem;
  }
  h1 {
    margin: 0 0 0.5rem;
    font-size: 1.25rem;
    font-weight: 600;
  }
  p {
    margin: 0;
    color: var(--text-muted);
  }
</style>
</head>
<body>
  <div class="card">
    <h1>Desktop locked</h1>
    <p>No exam session is running. Start your exam from the exam UI to unlock the desktop.</p>
  </div>
</body>
</html>
`
