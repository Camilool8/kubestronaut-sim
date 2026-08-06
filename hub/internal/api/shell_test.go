package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func shellFS() fstest.MapFS {
	return fstest.MapFS{
		"index.html":         {Data: []byte("<!doctype html><div id=root></div>")},
		"assets/app-a1b2.js": {Data: []byte("console.log('app')")},
	}
}

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
