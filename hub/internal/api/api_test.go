package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"kubestronaut-sim/hub/internal/auth"
	"kubestronaut-sim/hub/internal/store"
)

func newServer(t *testing.T, mode auth.Mode) (*Server, *store.Store) {
	t.Helper()
	st, err := store.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	signer, err := auth.NewSigner([]byte(strings.Repeat("k", 32)))
	if err != nil {
		t.Fatal(err)
	}
	s := &Server{
		Auth: &auth.Authenticator{
			Mode: mode, Signer: signer, Secure: true, TTL: time.Hour,
			HeaderName: "X-Forwarded-User",
		},
		Store:   st,
		BaseURL: "https://hub.example",
		Logf:    func(string, ...any) {},
	}
	return s, st
}

func login(t *testing.T, s *Server, userID, name string) *http.Cookie {
	t.Helper()
	w := httptest.NewRecorder()
	if err := s.Auth.Issue(w, auth.Session{UserID: userID, Login: name}); err != nil {
		t.Fatal(err)
	}
	return w.Result().Cookies()[0]
}

func do(s *Server, r *http.Request) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	return w
}

// /api/me answers 200 even when nobody is logged in. That is the whole
// mechanism the SPA uses to tell a hub from a local facilitator, which
// JSON-404s any /api/* it does not know — a 401 here would conflate
// "hosted, logged out" with "not hosted".
func TestMeAnswers200WhenLoggedOut(t *testing.T) {
	s, _ := newServer(t, auth.ModeGitHub)

	w := do(s, httptest.NewRequest(http.MethodGet, "/api/me", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var body me
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Authenticated {
		t.Error("authenticated = true with no cookie")
	}
	if body.LoginURL == "" {
		t.Error("no loginURL offered to a logged-out user")
	}
	if body.AuthMode != "github" {
		t.Errorf("authMode = %q, want github", body.AuthMode)
	}
}

func TestMeIdentifiesALoggedInUser(t *testing.T) {
	s, _ := newServer(t, auth.ModeGitHub)
	r := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	r.AddCookie(login(t, s, "583231", "octocat"))

	w := do(s, r)
	var body me
	json.Unmarshal(w.Body.Bytes(), &body)
	if !body.Authenticated || body.User == nil {
		t.Fatalf("body = %+v, want an authenticated user", body)
	}
	if body.User.ID != "583231" || body.User.Login != "octocat" {
		t.Errorf("user = %+v", body.User)
	}
}

func TestHistoryRequiresASession(t *testing.T) {
	s, _ := newServer(t, auth.ModeGitHub)
	if w := do(s, httptest.NewRequest(http.MethodGet, "/api/history", nil)); w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", w.Code)
	}
}

// The stored record comes back byte-identical, because the UI renders it
// with the same components it uses against a local facilitator.
func TestHistoryReturnsTheStoredRecordUnchanged(t *testing.T) {
	s, st := newServer(t, auth.ModeGitHub)
	rec := json.RawMessage(`{"id":"a1","gradedAt":"2026-08-03T10:00:00Z","earned":170,"total":180,"aNewField":true}`)
	if _, err := st.Add("583231", rec, nil); err != nil {
		t.Fatal(err)
	}

	r := httptest.NewRequest(http.MethodGet, "/api/history", nil)
	r.AddCookie(login(t, s, "583231", "octocat"))
	w := do(s, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	var doc store.History
	if err := json.Unmarshal(w.Body.Bytes(), &doc); err != nil {
		t.Fatal(err)
	}
	if len(doc.Attempts) != 1 {
		t.Fatalf("attempts = %d, want 1", len(doc.Attempts))
	}
	if !strings.Contains(string(doc.Attempts[0]), `"aNewField":true`) {
		t.Errorf("record lost a field in transit: %s", doc.Attempts[0])
	}
}

// The dashboard shape, not the interchange one.
//
// Progress.tsx reads `summary.weakDomains` without checking and lists
// attempts newest first. Serving store.Document here — versioned,
// oldest first, no summary — renders a blank dashboard rather than a
// visibly wrong one, which is the failure mode worth a test.
func TestHistoryIsTheDashboardShapeNotTheExportShape(t *testing.T) {
	s, st := newServer(t, auth.ModeGitHub)
	for _, rec := range []string{
		`{"id":"older","certification":"CKAD","mode":"exam","counted":true,"passed":true,
		  "gradedAt":"2026-08-01T10:00:00Z","percent":75,
		  "domains":[{"domain":"Observability","earned":2,"total":10}]}`,
		`{"id":"newer","certification":"KCNA","mode":"exam","counted":true,"passed":true,
		  "gradedAt":"2026-08-04T10:00:00Z","percent":90,
		  "domains":[{"domain":"Fundamentals","earned":9,"total":10}]}`,
	} {
		if _, err := st.Add("583231", json.RawMessage(rec), nil); err != nil {
			t.Fatal(err)
		}
	}

	r := httptest.NewRequest(http.MethodGet, "/api/history", nil)
	r.AddCookie(login(t, s, "583231", "octocat"))
	w := do(s, r)

	var body struct {
		Version  *int              `json:"version"`
		Attempts []json.RawMessage `json:"attempts"`
		Summary  struct {
			Attempts    int `json:"attempts"`
			PassedCount int `json:"passedCount"`
			TrackCount  int `json:"trackCount"`
			WeakDomains []struct {
				Domain string `json:"domain"`
			} `json:"weakDomains"`
		} `json:"summary"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Version != nil {
		t.Error("the dashboard response carries an interchange version field")
	}
	if len(body.Attempts) != 2 || !strings.Contains(string(body.Attempts[0]), `"newer"`) {
		t.Errorf("attempts are not newest first: %s", w.Body.String())
	}
	if body.Summary.Attempts != 2 || body.Summary.PassedCount != 2 || body.Summary.TrackCount != 5 {
		t.Errorf("summary = %+v", body.Summary)
	}
	if len(body.Summary.WeakDomains) != 2 || body.Summary.WeakDomains[0].Domain != "Observability" {
		t.Errorf("weak domains = %+v, want Observability first", body.Summary.WeakDomains)
	}
}

// Export stays the interchange document: versioned, oldest first, and
// importable by a local `./sim`. That is the whole reason hosted export
// exists while hosted import is refused.
func TestExportIsStillTheInterchangeDocument(t *testing.T) {
	s, st := newServer(t, auth.ModeGitHub)
	if _, err := st.Add("583231", json.RawMessage(`{"id":"a1","gradedAt":"2026-08-03T10:00:00Z"}`), nil); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodGet, "/api/history/export", nil)
	r.AddCookie(login(t, s, "583231", "octocat"))
	w := do(s, r)

	var doc store.Document
	if err := json.Unmarshal(w.Body.Bytes(), &doc); err != nil {
		t.Fatal(err)
	}
	if doc.Version == 0 {
		t.Error("export lost its version, so a local import cannot check it")
	}
}

// The sharpest property in this package: one user must never be able to
// read another's attempt, even knowing its ID exactly.
func TestOneUserCannotReadAnothersAttempt(t *testing.T) {
	s, st := newServer(t, auth.ModeGitHub)
	rec := json.RawMessage(`{"id":"secret1","gradedAt":"2026-08-03T10:00:00Z"}`)
	results := json.RawMessage(`{"checks":[{"id":"q01","passed":true}]}`)
	if _, err := st.Add("583231", rec, results); err != nil {
		t.Fatal(err)
	}

	// The owner can read it.
	own := httptest.NewRequest(http.MethodGet, "/api/history/secret1", nil)
	own.AddCookie(login(t, s, "583231", "octocat"))
	if w := do(s, own); w.Code != http.StatusOK {
		t.Fatalf("owner got %d, want 200", w.Code)
	}

	// Someone else, with the exact ID, does not.
	other := httptest.NewRequest(http.MethodGet, "/api/history/secret1", nil)
	other.AddCookie(login(t, s, "999999", "attacker"))
	w := do(s, other)
	if w.Code != http.StatusNotFound {
		t.Errorf("another user got %d for someone else's attempt, want 404", w.Code)
	}
	if strings.Contains(w.Body.String(), "passed") {
		t.Error("another user's results leaked into the response body")
	}
}

func TestAttemptWithATraversingIDIsNotFound(t *testing.T) {
	s, _ := newServer(t, auth.ModeGitHub)
	r := httptest.NewRequest(http.MethodGet, "/api/history/"+url.PathEscape("../../etc/passwd"), nil)
	r.AddCookie(login(t, s, "583231", "octocat"))
	if w := do(s, r); w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", w.Code)
	}
}

func TestLoginSetsStateAndRedirectsToGitHub(t *testing.T) {
	s, _ := newServer(t, auth.ModeGitHub)
	s.Auth.GitHub = auth.NewGitHub("cid", "csecret", "https://hub.example/hub/auth/callback")

	w := do(s, httptest.NewRequest(http.MethodGet, "/hub/auth/login", nil))
	if w.Code != http.StatusFound {
		t.Fatalf("status = %d, want 302", w.Code)
	}
	loc, err := url.Parse(w.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	state := loc.Query().Get("state")
	if state == "" {
		t.Fatal("redirect carried no state")
	}
	var found *http.Cookie
	for _, c := range w.Result().Cookies() {
		if c.Name == stateCookie {
			found = c
		}
	}
	if found == nil {
		t.Fatal("no state cookie was set")
	}
	if found.Value != state {
		t.Errorf("state cookie %q does not match redirect state %q", found.Value, state)
	}
	if !found.HttpOnly {
		t.Error("state cookie is not HttpOnly")
	}
}

// Without this check an attacker can complete a login flow in someone
// else's browser and leave them signed in as the attacker.
func TestCallbackRejectsAMismatchedState(t *testing.T) {
	s, _ := newServer(t, auth.ModeGitHub)
	s.Auth.GitHub = auth.NewGitHub("cid", "csecret", "https://hub.example/hub/auth/callback")

	for name, setup := range map[string]func(*http.Request){
		"no cookie at all": func(r *http.Request) {},
		"cookie differs": func(r *http.Request) {
			r.AddCookie(&http.Cookie{Name: stateCookie, Value: "someone-elses"})
		},
		"empty cookie": func(r *http.Request) {
			r.AddCookie(&http.Cookie{Name: stateCookie, Value: ""})
		},
	} {
		r := httptest.NewRequest(http.MethodGet, "/hub/auth/callback?code=c1&state=mine", nil)
		setup(r)
		if w := do(s, r); w.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, want 400", name, w.Code)
		}
	}
}

func TestCallbackCompletesTheLogin(t *testing.T) {
	s, _ := newServer(t, auth.ModeGitHub)
	gh := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/token":
			w.Write([]byte(`{"access_token":"tok-123"}`))
		case "/user":
			w.Write([]byte(`{"login":"octocat","id":583231}`))
		}
	}))
	defer gh.Close()
	s.Auth.GitHub = auth.NewGitHub("cid", "csecret", "https://hub.example/hub/auth/callback")
	s.Auth.GitHub.TokenURL = gh.URL + "/token"
	s.Auth.GitHub.UserURL = gh.URL + "/user"

	r := httptest.NewRequest(http.MethodGet, "/hub/auth/callback?code=c1&state=st1", nil)
	r.AddCookie(&http.Cookie{Name: stateCookie, Value: "st1"})
	w := do(s, r)

	if w.Code != http.StatusFound {
		t.Fatalf("status = %d, want 302; body=%s", w.Code, w.Body)
	}
	var session *http.Cookie
	for _, c := range w.Result().Cookies() {
		if strings.Contains(c.Name, "kubestronaut_session") {
			session = c
		}
	}
	if session == nil {
		t.Fatal("callback issued no session cookie")
	}
	// And that cookie really identifies the GitHub user.
	check := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	check.AddCookie(session)
	var body me
	json.Unmarshal(do(s, check).Body.Bytes(), &body)
	if body.User == nil || body.User.ID != "583231" {
		t.Errorf("session identifies %+v, want GitHub id 583231", body.User)
	}
}

// Header mode is for a deployment that already terminates auth upstream;
// GitHub's routes must not pretend to work there.
func TestLoginRoutesAreAbsentOutsideGitHubMode(t *testing.T) {
	s, _ := newServer(t, auth.ModeHeader)
	for _, path := range []string{"/hub/auth/login", "/hub/auth/callback"} {
		if w := do(s, httptest.NewRequest(http.MethodGet, path, nil)); w.Code != http.StatusNotFound {
			t.Errorf("%s status = %d, want 404 in header mode", path, w.Code)
		}
	}
}

func TestHeaderModeIdentifiesFromTheHeader(t *testing.T) {
	s, _ := newServer(t, auth.ModeHeader)
	r := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	r.Header.Set("X-Forwarded-User", "1234")

	var body me
	json.Unmarshal(do(s, r).Body.Bytes(), &body)
	if !body.Authenticated || body.User.ID != "1234" {
		t.Errorf("body = %+v, want the header's user", body)
	}
}

func TestLogoutClearsTheSession(t *testing.T) {
	s, _ := newServer(t, auth.ModeGitHub)
	w := do(s, httptest.NewRequest(http.MethodPost, "/hub/auth/logout", nil))
	if w.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", w.Code)
	}
	for _, c := range w.Result().Cookies() {
		if strings.Contains(c.Name, "kubestronaut_session") && c.MaxAge >= 0 {
			t.Errorf("session cookie MaxAge = %d, want negative", c.MaxAge)
		}
	}
}
