package desktop

import (
	"net/http"
	"net/http/httputil"
	"strings"
)

const prefix = "/desktop"

func New(target string, unlocked func() bool) http.Handler {
	proxy := &httputil.ReverseProxy{
		FlushInterval: -1,
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.Out.URL.Scheme = "http"
			pr.Out.URL.Host = target
			pr.Out.URL.Path = stripPrefix(pr.In.URL.Path)
			pr.Out.URL.RawPath = ""
			pr.Out.Host = ""
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

func stripPrefix(p string) string {
	if rest, ok := strings.CutPrefix(p, prefix+"/"); ok {
		return "/" + rest
	}
	return p
}

func redirectToSlash(w http.ResponseWriter, r *http.Request) {
	target := prefix + "/"
	if r.URL.RawQuery != "" {
		target += "?" + r.URL.RawQuery
	}
	http.Redirect(w, r, target, http.StatusPermanentRedirect)
}

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

const lockedText = "desktop locked: no exam session is running\n"

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
    --bg: #f6f8fc;
    --surface: #ffffff;
    --border: #d7dde8;
    --text: #101728;
    --text-muted: #5a6478;
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #101728;
    --surface: #182033;
    --border: #3a4560;
    --text: #dfe5ee;
    --text-muted: #94a0b2;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]):not([data-theme="dark"]) {
      color-scheme: dark;
      --bg: #101728;
      --surface: #182033;
      --border: #3a4560;
      --text: #dfe5ee;
      --text-muted: #94a0b2;
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
