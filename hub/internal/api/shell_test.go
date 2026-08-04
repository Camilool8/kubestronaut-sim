package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

// shellFS stands in for the embedded Vite build: an index and one hashed
// asset, which is enough to tell "served the app" from "served index.html
// to everything" apart.
func shellFS() fstest.MapFS {
	return fstest.MapFS{
		"index.html":         {Data: []byte("<!doctype html><div id=root></div>")},
		"assets/app-a1b2.js": {Data: []byte("console.log('app')")},
	}
}

// withShell builds a hub that has seats and a bundle but no running
// session — the state every candidate is in before they start one, and
// the state a first-time visitor is in forever.
func withShell(t *testing.T) *Server {
	t.Helper()
	s, _ := hosted(t, 1, nil)
	s.UI = shellFS()
	return s
}

func body(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	b, err := io.ReadAll(w.Result().Body)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// The bug this file exists for. A visitor arriving at the hub for the
// first time has no cookie and no session, and the screen that would
// give them both is in the bundle — so a JSON 401 here is not a rude
// error message, it is the entire product being unreachable.
func TestTheRootServesTheAppWhenNobodyIsSignedIn(t *testing.T) {
	s := withShell(t)

	w := do(s, httptest.NewRequest(http.MethodGet, "/", nil))

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", w.Code, body(t, w))
	}
	if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Errorf("Content-Type = %q, want text/html", ct)
	}
	if got := body(t, w); !strings.Contains(got, "id=root") {
		t.Errorf("body = %q, want the app shell", got)
	}
}

// The assets are the other half: they are requested without an
// Accept: text/html header, so a rule written around Accept would serve
// index.html and then 401 every script tag inside it.
func TestAssetsAreServedBeforeAnyoneSignsIn(t *testing.T) {
	s := withShell(t)

	w := do(s, httptest.NewRequest(http.MethodGet, "/assets/app-a1b2.js", nil))

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if got := body(t, w); got != "console.log('app')" {
		t.Errorf("body = %q, want the asset itself", got)
	}
}

// A client-side route names no file. It must load the app, not 404,
// or every hosted history link a candidate opens in a new tab breaks.
func TestADeepLinkLoadsTheApp(t *testing.T) {
	s := withShell(t)

	w := do(s, httptest.NewRequest(http.MethodGet, "/history/2026-08-04T10-00-00Z", nil))

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if got := body(t, w); !strings.Contains(got, "id=root") {
		t.Errorf("body = %q, want the app shell", got)
	}
}

// The contract the shell must not break: /api/ and /hub/ are fetch()
// surfaces. Handing them index.html turns a clear 401 into a JSON parse
// error somewhere else entirely.
func TestApiAndHubPathsKeepTheirJSONWhenNobodyIsSignedIn(t *testing.T) {
	s := withShell(t)

	for _, path := range []string{"/api/session/whatever", "/hub/nothing-here"} {
		w := do(s, httptest.NewRequest(http.MethodGet, path, nil))

		if w.Code != http.StatusUnauthorized {
			t.Errorf("%s: status = %d, want 401", path, w.Code)
		}
		if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
			t.Errorf("%s: Content-Type = %q, want JSON", path, ct)
		}
	}
}

// Signed in, no seat claimed yet: this is the lobby, and the lobby is a
// screen of the same bundle.
func TestTheLobbyIsServedToASignedInUserWithNoSession(t *testing.T) {
	s := withShell(t)
	c := login(t, s, "u1", "candidate")

	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.AddCookie(c)
	w := do(s, r)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", w.Code, body(t, w))
	}
	if got := body(t, w); !strings.Contains(got, "id=root") {
		t.Errorf("body = %q, want the app shell", got)
	}
}

// ...while the API still says what it always said, because the SPA
// polling for a session it does not have needs the 404 to know that.
func TestApiStillSays404ForASignedInUserWithNoSession(t *testing.T) {
	s := withShell(t)
	c := login(t, s, "u1", "candidate")

	r := httptest.NewRequest(http.MethodGet, "/api/anything", nil)
	r.AddCookie(c)
	w := do(s, r)

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
	if got := body(t, w); !strings.Contains(got, "no session running") {
		t.Errorf("body = %q, want the no-session error", got)
	}
}

// Once a Pod is up the proxy wins, so a candidate mid-exam is served by
// their own session and not by whatever the hub happens to have embedded.
// Both are the same build, but only one of them is the one their exam is
// running against.
func TestARunningSessionIsServedByItsPodNotTheHubsCopy(t *testing.T) {
	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		io.WriteString(w, "<!doctype html><div id=root data-from=pod></div>")
	})
	s, _ := hosted(t, 1, upstream)
	s.UI = shellFS()
	c := login(t, s, "u1", "candidate")
	if w := ready(t, s, c, `{}`); w.Code != http.StatusOK {
		t.Fatalf("starting a session: %d %s", w.Code, body(t, w))
	}

	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.AddCookie(c)
	w := do(s, r)

	if got := body(t, w); !strings.Contains(got, "data-from=pod") {
		t.Errorf("body = %q, want the Pod's own bundle", got)
	}
}

// A hub built without a bundle answers exactly as it did before this
// existed. Nothing silently degrades to a blank page.
func TestNoBundleMeansTheOldJSONErrors(t *testing.T) {
	s, _ := hosted(t, 1, nil)
	s.UI = nil

	w := do(s, httptest.NewRequest(http.MethodGet, "/", nil))

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("Content-Type = %q, want JSON", ct)
	}
}

// A WebSocket handshake is a GET that is not under /api/, so the shell
// would otherwise answer the desktop stream with an HTML page and the
// browser would report code 1006 — an abnormal close with no reason,
// while the Pod was merely still booting.
func TestAWebSocketUpgradeIsNeverAnsweredWithHTML(t *testing.T) {
	s := withShell(t)
	c := login(t, s, "u1", "candidate")

	r := httptest.NewRequest(http.MethodGet, "/desktop/websockify", nil)
	r.Header.Set("Upgrade", "websocket")
	r.Header.Set("Connection", "Upgrade")
	r.AddCookie(c)
	w := do(s, r)

	if ct := w.Header().Get("Content-Type"); strings.HasPrefix(ct, "text/html") {
		t.Fatalf("Content-Type = %q: a stream handshake was answered with the app", ct)
	}
	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want the proxy's own 404 for a session that does not exist", w.Code)
	}
}
