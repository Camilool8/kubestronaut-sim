package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// The backstop, and the only guard every attempt passes through. The hub
// refuses a hands-on seat earlier and more cheaply, but it is not in the
// path of a local candidate at all — `./sim up` reaches this handler
// directly.
//
// coarse is a client that measured itself and found no precise pointer.
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

// A hands-on attempt is a terminal and a remote desktop beside the
// questions. Starting a clock a phone cannot answer against is worse
// than saying no: the countdown is server-side and does not stop.
func TestAHandsOnAttemptIsRefusedOnAPhone(t *testing.T) {
	ts := newTestServer(t)

	rec := ts.startAs(t, "coarse")

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; body %s", rec.Code, rec.Body)
	}
	if got := errorCode(t, rec); got != "desktop_required" {
		t.Errorf("code = %q, want desktop_required — the SPA answers this with a screen", got)
	}
	// The refusal has to happen before the session exists, or the clock
	// is running behind an error the candidate cannot dismiss.
	if snap := ts.mgr.Snapshot(); snap.State != "idle" {
		t.Errorf("session state = %q, want idle: a refused start must not begin an attempt", snap.State)
	}
}

// The whole reason a phone is welcome in this product. An mcq attempt
// needs no cluster, no instances and no desktop.
func TestAnMcqAttemptIsNeverRefusedOnAPhone(t *testing.T) {
	ts := newMCQTestServer(t, false)

	if rec := ts.startAs(t, "coarse"); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body %s", rec.Code, rec.Body)
	}
}

// `./sim`, tests/smoke.sh and every curl POST send no header at all, and
// they must keep working unchanged. An absent header means "this client
// could not tell", not "coarse" — see PRODUCT.md on why these gates are
// UX fidelity rather than security.
func TestAClientThatDeclaresNothingStartsNormally(t *testing.T) {
	ts := newTestServer(t)

	if rec := ts.startAs(t, ""); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body %s", rec.Code, rec.Body)
	}
}

// A laptop declares itself too, and the positive answer must be admitted
// as readily as the absent one — otherwise the guard turns away exactly
// the clients that cooperate with it.
func TestAFinePointerStartsNormally(t *testing.T) {
	ts := newTestServer(t)

	if rec := ts.startAs(t, "fine"); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body %s", rec.Code, rec.Body)
	}
}

// An unrecognised value is not a refusal. A future client sending
// something this build has never heard of must fail open, for the same
// reason an absent header does.
func TestAnUnknownPointerValueStartsNormally(t *testing.T) {
	ts := newTestServer(t)

	if rec := ts.startAs(t, "stylus"); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body %s", rec.Code, rec.Body)
	}
}
