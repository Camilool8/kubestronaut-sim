package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func (ts *testServer) startAs(t *testing.T, pointer string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/session/start", bytes.NewBufferString(`{"mode":"exam"}`))
	req.Header.Set("Content-Type", "application/json")
	if pointer != "" {
		req.Header.Set("X-Sim-Pointer", pointer)
	}
	rec := httptest.NewRecorder()
	ts.handler.ServeHTTP(rec, req)
	return rec
}

func errorCode(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("body %q is not JSON: %v", rec.Body, err)
	}
	return body.Code
}

func TestAHandsOnAttemptIsRefusedOnAPhone(t *testing.T) {
	ts := newTestServer(t)

	rec := ts.startAs(t, "coarse")

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; body %s", rec.Code, rec.Body)
	}
	if got := errorCode(t, rec); got != "desktop_required" {
		t.Errorf("code = %q, want desktop_required — the SPA answers this with a screen", got)
	}

	if snap := ts.mgr.Snapshot(); snap.State != "idle" {
		t.Errorf("session state = %q, want idle: a refused start must not begin an attempt", snap.State)
	}
}

func TestAnMcqAttemptIsNeverRefusedOnAPhone(t *testing.T) {
	ts := newMCQTestServer(t, false)

	if rec := ts.startAs(t, "coarse"); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body %s", rec.Code, rec.Body)
	}
}

func TestAClientThatDeclaresNothingStartsNormally(t *testing.T) {
	ts := newTestServer(t)

	if rec := ts.startAs(t, ""); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body %s", rec.Code, rec.Body)
	}
}

func TestAFinePointerStartsNormally(t *testing.T) {
	ts := newTestServer(t)

	if rec := ts.startAs(t, "fine"); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body %s", rec.Code, rec.Body)
	}
}

func TestAnUnknownPointerValueStartsNormally(t *testing.T) {
	ts := newTestServer(t)

	if rec := ts.startAs(t, "stylus"); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body %s", rec.Code, rec.Body)
	}
}
