package api_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"kubestronaut-sim/facilitator/internal/session"
)

// httptest.NewRequest gives every request this Host, so it is what an
// same-origin Origin header has to name.
const (
	sameOrigin  = "http://example.com"
	otherOrigin = "https://attacker.example"
)

func (ts *testServer) doWithHeaders(t *testing.T, method, path string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	ts.handler.ServeHTTP(rec, req)
	return rec
}

// The allowed direction. The bare case matters most: ./sim, tests/smoke.sh and
// every curl send neither Sec-Fetch-Site nor Origin, and must keep working.
func TestSessionEndAllowedSameOrigin(t *testing.T) {
	cases := []struct {
		name    string
		headers map[string]string
	}{
		{"no headers at all (curl, ./sim, smoke)", nil},
		{"Sec-Fetch-Site same-origin", map[string]string{"Sec-Fetch-Site": "same-origin", "Origin": sameOrigin}},
		{"Sec-Fetch-Site none (address bar)", map[string]string{"Sec-Fetch-Site": "none"}},
		{"Origin matching Host, no Sec-Fetch-Site", map[string]string{"Origin": sameOrigin}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ts := newTestServer(t)
			if _, err := ts.mgr.Start(session.ModeExam, time.Hour); err != nil {
				t.Fatalf("Start: %v", err)
			}

			rec := ts.doWithHeaders(t, http.MethodPost, "/api/session/end", tc.headers)
			if rec.Code != http.StatusAccepted {
				t.Fatalf("status = %d, want 202, body=%s", rec.Code, rec.Body.String())
			}
			if ts.grader.calls != 1 {
				t.Errorf("grader.calls = %d, want 1", ts.grader.calls)
			}
			if state := ts.mgr.Snapshot().State; state != "ended" {
				t.Errorf("state = %q, want ended", state)
			}
		})
	}
}

// The refused direction. A page in another tab can suppress neither header, so
// it cannot end a live attempt.
func TestSessionEndRefusedCrossOrigin(t *testing.T) {
	cases := []struct {
		name    string
		headers map[string]string
	}{
		{"Sec-Fetch-Site cross-site", map[string]string{"Sec-Fetch-Site": "cross-site", "Origin": otherOrigin}},
		{"Sec-Fetch-Site cross-site, Origin suppressed", map[string]string{"Sec-Fetch-Site": "cross-site"}},
		{"Sec-Fetch-Site same-site", map[string]string{"Sec-Fetch-Site": "same-site", "Origin": otherOrigin}},
		{"Origin not matching Host, no Sec-Fetch-Site", map[string]string{"Origin": otherOrigin}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ts := newTestServer(t)
			if _, err := ts.mgr.Start(session.ModeExam, time.Hour); err != nil {
				t.Fatalf("Start: %v", err)
			}

			rec := ts.doWithHeaders(t, http.MethodPost, "/api/session/end", tc.headers)
			if rec.Code != http.StatusForbidden {
				t.Fatalf("status = %d, want 403, body=%s", rec.Code, rec.Body.String())
			}
			if ts.grader.calls != 0 {
				t.Errorf("grader.calls = %d, want 0 — the refusal must land before the handler", ts.grader.calls)
			}
			if state := ts.mgr.Snapshot().State; state != "running" {
				t.Errorf("state = %q, want running — the attempt must survive the refused request", state)
			}
		})
	}
}

// The /api/control/ proxy is mounted on the same mux, so the gate covers the
// conductor routes too — POST /api/control/reset rebuilds the cluster.
func TestControlProxyCrossOrigin(t *testing.T) {
	const proxied = "control:/api/control/reset"

	t.Run("same-origin reaches the conductor", func(t *testing.T) {
		ts := newTestServer(t)
		rec := ts.doWithHeaders(t, http.MethodPost, "/api/control/reset", map[string]string{
			"Sec-Fetch-Site": "same-origin",
			"Origin":         sameOrigin,
		})
		if rec.Code != http.StatusAccepted {
			t.Fatalf("status = %d, want 202, body=%s", rec.Code, rec.Body.String())
		}
		if got := rec.Body.String(); got != proxied {
			t.Errorf("body = %q, want %q", got, proxied)
		}
	})

	t.Run("cross-origin never reaches the conductor", func(t *testing.T) {
		ts := newTestServer(t)
		rec := ts.doWithHeaders(t, http.MethodPost, "/api/control/reset", map[string]string{
			"Sec-Fetch-Site": "cross-site",
			"Origin":         otherOrigin,
		})
		if rec.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want 403, body=%s", rec.Code, rec.Body.String())
		}
		if got := rec.Body.String(); got == proxied {
			t.Errorf("body = %q — the request was proxied to the conductor anyway", got)
		}
	})

	t.Run("bare request still reaches the conductor", func(t *testing.T) {
		ts := newTestServer(t)
		rec := ts.do(t, http.MethodPost, "/api/control/reset")
		if rec.Code != http.StatusAccepted {
			t.Fatalf("status = %d, want 202, body=%s", rec.Code, rec.Body.String())
		}
	})
}

// Safe methods are exempt by design; nothing they reach changes state. The
// codes are pinned rather than merely "not 403", so the test still means
// something if a route starts answering differently.
func TestSafeMethodsSurviveCrossOrigin(t *testing.T) {
	paths := map[string]int{
		"/healthz":             http.StatusOK,
		"/api/exam":            http.StatusOK,
		"/api/session":         http.StatusOK,
		"/api/control/status":  http.StatusAccepted, // fakeControl's answer
		"/api/history/summary": http.StatusServiceUnavailable,
	}

	ts := newTestServer(t)
	for path, want := range paths {
		rec := ts.doWithHeaders(t, http.MethodGet, path, map[string]string{
			"Sec-Fetch-Site": "cross-site",
			"Origin":         otherOrigin,
		})
		if rec.Code != want {
			t.Errorf("GET %s = %d, want %d — safe methods must stay reachable, body=%s",
				path, rec.Code, want, rec.Body.String())
		}
	}
}

// The other mutating routes the mux carries, pinned so the gate is not quietly
// scoped to one handler.
//
// Two of these routes answer 403 on their own (docs and mid-attempt scoring
// are Training-mode only), so a bare "is it 403" assertion would pass with no
// gate at all. Each route is therefore also driven same-origin, and the two
// bodies have to differ: the gate answers in plain text, every handler here
// answers in JSON.
func TestMutatingRoutesRefusedCrossOrigin(t *testing.T) {
	routes := []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/api/session/start"},
		{http.MethodPost, "/api/session/grade"},
		{http.MethodDelete, "/api/session"},
		{http.MethodPut, "/api/session/focus"},
		{http.MethodPut, "/api/questions/q01/answer"},
		{http.MethodPost, "/api/history/import"},
		{http.MethodDelete, "/api/history"},
		{http.MethodPost, "/api/control/switch"},
		{http.MethodPost, "/api/questions/q01/docs/open"},
	}

	for _, rt := range routes {
		crossed := newTestServer(t).doWithHeaders(t, rt.method, rt.path, map[string]string{
			"Sec-Fetch-Site": "cross-site",
			"Origin":         otherOrigin,
		})
		if crossed.Code != http.StatusForbidden {
			t.Errorf("cross-origin %s %s = %d, want 403, body=%s",
				rt.method, rt.path, crossed.Code, crossed.Body.String())
			continue
		}

		allowed := newTestServer(t).doWithHeaders(t, rt.method, rt.path, map[string]string{
			"Sec-Fetch-Site": "same-origin",
			"Origin":         sameOrigin,
		})
		if allowed.Body.String() == crossed.Body.String() {
			t.Errorf("%s %s answers %q either way — the 403 is the handler's, not the gate's",
				rt.method, rt.path, crossed.Body.String())
		}
	}
}
