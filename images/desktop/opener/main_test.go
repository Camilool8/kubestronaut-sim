package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func post(t *testing.T, h http.Handler, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/open", strings.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestOpensAnHTTPSURL(t *testing.T) {
	var got string
	h := openHandler(func(u string) error {
		got = u
		return nil
	})

	rec := post(t, h, `{"url":"https://kubernetes.io/docs/concepts/services-networking/ingress/"}`)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204: %s", rec.Code, rec.Body)
	}
	if want := "https://kubernetes.io/docs/concepts/services-networking/ingress/"; got != want {
		t.Errorf("opened %q, want %q", got, want)
	}
}

func TestRefusesWhatIsNotAnHTTPSPage(t *testing.T) {
	cases := map[string]string{
		"plain http":     `{"url":"http://kubernetes.io/docs/"}`,
		"a file":         `{"url":"file:///etc/shadow"}`,
		"javascript":     `{"url":"javascript:alert(1)"}`,
		"scheme only":    `{"url":"https://"}`,
		"empty":          `{"url":""}`,
		"missing key":    `{}`,
		"not even a URL": `{"url":"kubernetes.io/docs"}`,
	}

	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			called := false
			h := openHandler(func(string) error {
				called = true
				return nil
			})

			rec := post(t, h, body)

			if rec.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want 400", rec.Code)
			}
			if called {
				t.Error("the browser was launched for a URL that should have been refused")
			}
		})
	}
}

func TestRefusesAMalformedBody(t *testing.T) {
	called := false
	h := openHandler(func(string) error {
		called = true
		return nil
	})

	rec := post(t, h, "not json")

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
	if called {
		t.Error("the browser was launched for an undecodable body")
	}
}

func TestRefusesAnOverlongURL(t *testing.T) {
	called := false
	h := openHandler(func(string) error {
		called = true
		return nil
	})

	rec := post(t, h, `{"url":"https://kubernetes.io/`+strings.Repeat("a", 2100)+`"}`)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
	if called {
		t.Error("the browser was launched for an overlong URL")
	}
}

func TestReportsABrowserThatWillNotStart(t *testing.T) {
	h := openHandler(func(string) error { return errBrowser{} })

	rec := post(t, h, `{"url":"https://kubernetes.io/docs/"}`)

	if rec.Code != http.StatusBadGateway {
		t.Errorf("status = %d, want 502", rec.Code)
	}
}

type errBrowser struct{}

func (errBrowser) Error() string { return "exec: firefox-esr: not found" }

// The route is POST-only: a GET that opened a tab would let any page the
// candidate visits drive their desktop through a plain image or link.
func TestGetDoesNotOpen(t *testing.T) {
	mux := http.NewServeMux()
	called := false
	mux.Handle("POST /open", openHandler(func(string) error {
		called = true
		return nil
	}))

	req := httptest.NewRequest(http.MethodGet, "/open", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if called {
		t.Error("a GET launched the browser")
	}
	if rec.Code == http.StatusNoContent {
		t.Errorf("status = %d, want a refusal", rec.Code)
	}
}
