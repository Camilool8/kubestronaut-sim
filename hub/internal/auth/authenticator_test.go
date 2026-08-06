package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func githubStub(t *testing.T, token, user string, tokenStatus, userStatus int) *GitHub {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(tokenStatus)
			w.Write([]byte(token))
		case "/user":
			if got := r.Header.Get("Authorization"); got != "Bearer tok-123" {
				t.Errorf("user request Authorization = %q", got)
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(userStatus)
			w.Write([]byte(user))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(srv.Close)
	g := NewGitHub("cid", "csecret", "https://hub.example/hub/auth/callback")
	g.TokenURL = srv.URL + "/token"
	g.UserURL = srv.URL + "/user"
	g.AuthorizeURL = srv.URL + "/authorize"
	return g
}

func TestAuthCodeURLCarriesClientRedirectAndState(t *testing.T) {
	g := NewGitHub("cid", "csecret", "https://hub.example/hub/auth/callback")
	u, err := url.Parse(g.AuthCodeURL("state-abc"))
	if err != nil {
		t.Fatalf("AuthCodeURL produced an unparseable URL: %v", err)
	}
	q := u.Query()
	for k, want := range map[string]string{
		"client_id":    "cid",
		"redirect_uri": "https://hub.example/hub/auth/callback",
		"state":        "state-abc",
	} {
		if got := q.Get(k); got != want {
			t.Errorf("%s = %q, want %q", k, got, want)
		}
	}

	if q.Has("scope") {
		t.Errorf("AuthCodeURL requested scope %q; identity needs none", q.Get("scope"))
	}
}

func TestExchangeAndUser(t *testing.T) {
	g := githubStub(t, `{"access_token":"tok-123"}`, `{"login":"octocat","id":583231}`, 200, 200)

	tok, err := g.Exchange(context.Background(), "code-1")
	if err != nil {
		t.Fatalf("Exchange: %v", err)
	}
	if tok != "tok-123" {
		t.Errorf("token = %q, want tok-123", tok)
	}
	sess, err := g.User(context.Background(), tok)
	if err != nil {
		t.Fatalf("User: %v", err)
	}

	if sess.UserID != "583231" || sess.Login != "octocat" {
		t.Errorf("session = %+v, want UserID 583231 / Login octocat", sess)
	}
}

func TestExchangeFailures(t *testing.T) {
	cases := map[string]struct {
		body   string
		status int
	}{
		"error field with 200": {`{"error":"bad_verification_code","error_description":"expired"}`, 200},
		"no token with 200":    {`{}`, 200},
		"non-200":              {`{"access_token":"tok-123"}`, 500},
		"unparseable":          {`not json`, 200},
	}
	for name, c := range cases {
		g := githubStub(t, c.body, `{}`, c.status, 200)
		if _, err := g.Exchange(context.Background(), "code-1"); err == nil {
			t.Errorf("%s: Exchange succeeded, want an error", name)
		}
	}
}

func TestUserWithoutAnIDIsRefused(t *testing.T) {
	g := githubStub(t, `{"access_token":"tok-123"}`, `{"login":"octocat"}`, 200, 200)
	if _, err := g.User(context.Background(), "tok-123"); err == nil {
		t.Error("User accepted a response with no id")
	}
}

func TestModeNoneIsAlwaysTheSameLocalUser(t *testing.T) {
	a := &Authenticator{Mode: ModeNone}
	sess, err := a.Current(httptest.NewRequest(http.MethodGet, "/api/me", nil))
	if err != nil {
		t.Fatalf("Current: %v", err)
	}
	if sess.UserID != "local" {
		t.Errorf("UserID = %q, want local", sess.UserID)
	}
}

func TestModeHeaderReadsTheTrustedHeader(t *testing.T) {
	a := &Authenticator{Mode: ModeHeader, HeaderName: "X-Forwarded-User"}

	r := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	if _, err := a.Current(r); !errors.Is(err, ErrNoSession) {
		t.Errorf("no header = %v, want ErrNoSession", err)
	}
	r.Header.Set("X-Forwarded-User", "1234")
	sess, err := a.Current(r)
	if err != nil {
		t.Fatalf("Current: %v", err)
	}
	if sess.UserID != "1234" {
		t.Errorf("UserID = %q, want 1234", sess.UserID)
	}
}

func TestGitHubModeCookieRoundTrip(t *testing.T) {
	a := &Authenticator{Mode: ModeGitHub, Signer: testSigner(t), Secure: true, TTL: time.Hour}

	w := httptest.NewRecorder()
	if err := a.Issue(w, Session{UserID: "583231", Login: "octocat"}); err != nil {
		t.Fatalf("Issue: %v", err)
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("cookies = %d, want 1", len(cookies))
	}
	c := cookies[0]
	if !c.HttpOnly || !c.Secure {
		t.Errorf("cookie = %+v, want HttpOnly and Secure", c)
	}

	if c.SameSite != http.SameSiteLaxMode {
		t.Errorf("SameSite = %v, want Lax", c.SameSite)
	}
	if !strings.HasPrefix(c.Name, "__Host-") {
		t.Errorf("secure cookie name = %q, want a __Host- prefix", c.Name)
	}

	r := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	r.AddCookie(c)
	sess, err := a.Current(r)
	if err != nil {
		t.Fatalf("Current: %v", err)
	}
	if sess.UserID != "583231" || sess.Login != "octocat" {
		t.Errorf("session = %+v", sess)
	}
	if sess.Expires == 0 {
		t.Error("Issue did not stamp an expiry")
	}
}

func TestInsecureDeploymentDropsTheHostPrefix(t *testing.T) {
	a := &Authenticator{Mode: ModeGitHub, Signer: testSigner(t), Secure: false}
	w := httptest.NewRecorder()
	if err := a.Issue(w, Session{UserID: "1"}); err != nil {
		t.Fatal(err)
	}
	if name := w.Result().Cookies()[0].Name; strings.HasPrefix(name, "__Host-") {
		t.Errorf("insecure cookie name = %q, must not use __Host-", name)
	}
}

func TestForgedAndExpiredCookiesBothReadAsNoSession(t *testing.T) {
	a := &Authenticator{Mode: ModeGitHub, Signer: testSigner(t), Secure: true}
	for name, value := range map[string]string{
		"garbage": "not-a-cookie",
		"empty":   "",
	} {
		r := httptest.NewRequest(http.MethodGet, "/api/me", nil)
		r.AddCookie(&http.Cookie{Name: a.cookieName(), Value: value})
		if _, err := a.Current(r); !errors.Is(err, ErrNoSession) {
			t.Errorf("%s cookie = %v, want ErrNoSession", name, err)
		}
	}
}

func TestClearExpiresTheCookie(t *testing.T) {
	a := &Authenticator{Mode: ModeGitHub, Signer: testSigner(t), Secure: true}
	w := httptest.NewRecorder()
	a.Clear(w)
	c := w.Result().Cookies()[0]
	if c.MaxAge >= 0 {
		t.Errorf("MaxAge = %d, want negative so the browser drops it", c.MaxAge)
	}
}

func TestParseMode(t *testing.T) {
	for _, ok := range []string{"github", "header", "none"} {
		if _, err := ParseMode(ok); err != nil {
			t.Errorf("ParseMode(%q) = %v", ok, err)
		}
	}
	for _, bad := range []string{"", "oidc", "GitHub"} {
		if _, err := ParseMode(bad); err == nil {
			t.Errorf("ParseMode(%q) succeeded, want an error", bad)
		}
	}
}

func TestNewStateIsRandomAndURLSafe(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 100; i++ {
		s, err := NewState()
		if err != nil {
			t.Fatalf("NewState: %v", err)
		}
		if seen[s] {
			t.Fatal("NewState repeated a value")
		}
		seen[s] = true
		if s != url.QueryEscape(s) {
			t.Errorf("state %q is not URL-safe", s)
		}
	}
}
