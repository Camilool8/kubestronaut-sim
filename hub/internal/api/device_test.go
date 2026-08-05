package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kubestronaut-sim/hub/internal/session"
)

// coarse is a request from a client that measured itself and found no
// precise pointer — a phone or a tablet.
func coarse(r *http.Request) *http.Request {
	r.Header.Set(pointerHeader, "coarse")
	return r
}

func codeOf(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("body %q is not JSON: %v", w.Body, err)
	}
	return body.Code
}

// The whole point of putting the guard in the hub rather than only in
// the facilitator: a hands-on seat granted to a phone is a Pod boot
// nobody benefits from, and — when the pool is full — a place in the
// queue taken from a candidate who could have sat the exam. Refusing
// after admission would cost both.
func TestAPhoneIsRefusedAHandsOnSeatBeforeItIsSpent(t *testing.T) {
	s, mgr := hosted(t, 1, nil)
	c := login(t, s, "583231", "octocat")

	r := coarse(httptest.NewRequest(http.MethodPost, "/api/session/start", nil))
	r.AddCookie(c)
	w := do(s, r)

	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; body %s", w.Code, w.Body)
	}
	if got := codeOf(t, w); got != codeDesktopRequired {
		t.Errorf("code = %q, want %q — the SPA answers this with a screen", got, codeDesktopRequired)
	}
	// The assertion that makes this test worth having. A refusal that
	// still claimed the seat would leave the pool one short with nothing
	// running in it.
	if used := mgr.Seats()[session.Practical][0]; used != 0 {
		t.Errorf("seats used = %d, want 0: the seat must not be claimed and then refused", used)
	}
	if _, err := mgr.Get("583231"); err == nil {
		t.Error("a session was created for a request that was refused")
	}
}

// The other half of the same rule, and the one that would be easy to
// break by gating the endpoint instead of the kind. Multiple choice
// needs no cluster, no terminal and no keyboard.
func TestAPhoneMayStillTakeAnMcqSeat(t *testing.T) {
	s, c := hostedWithExams(t, okHandler())

	r := coarse(httptest.NewRequest(http.MethodPost, "/api/session/start", strings.NewReader(`{"bank":"kcna-mock"}`)))
	r.AddCookie(c)
	if w := do(s, r); w.Code == http.StatusConflict && codeOf(t, w) == codeDesktopRequired {
		t.Fatalf("an mcq start was refused as needing a desktop: %s", w.Body)
	}
}

// A named hands-on exam is refused on the exam's own engine, not on the
// `kind` the client happened to send — the same direction the rest of
// this handler resolves the two.
func TestANamedHandsOnExamIsRefusedOnAPhone(t *testing.T) {
	s, c := hostedWithExams(t, okHandler())

	r := coarse(httptest.NewRequest(http.MethodPost, "/api/session/start", strings.NewReader(`{"bank":"ckad-mock-01"}`)))
	r.AddCookie(c)
	w := do(s, r)

	if w.Code != http.StatusConflict || codeOf(t, w) != codeDesktopRequired {
		t.Fatalf("status = %d code = %q, want 409 %s", w.Code, codeOf(t, w), codeDesktopRequired)
	}
}

// `./sim`, tests/smoke.sh and every curl POST send no header at all, and
// an older SPA sends none either. They must keep working unchanged: this
// is UX fidelity, not security, and a missing header means "could not
// tell" rather than "coarse".
func TestAClientThatSaysNothingIsStillAdmitted(t *testing.T) {
	s, _ := hosted(t, 1, nil)
	r := httptest.NewRequest(http.MethodPost, "/api/session/start", nil)
	r.AddCookie(login(t, s, "583231", "octocat"))

	if w := do(s, r); w.Code == http.StatusConflict {
		t.Fatalf("a header-less client was refused: %d %s", w.Code, w.Body)
	}
}

// A laptop declares itself too. The positive answer has to be admitted
// as readily as the absent one, or the guard would turn away every
// client that cooperates with it.
func TestAFinePointerIsAdmitted(t *testing.T) {
	s, _ := hosted(t, 1, nil)
	r := httptest.NewRequest(http.MethodPost, "/api/session/start", nil)
	r.Header.Set(pointerHeader, "fine")
	r.AddCookie(login(t, s, "583231", "octocat"))

	if w := do(s, r); w.Code == http.StatusConflict {
		t.Fatalf("a fine-pointer client was refused: %d %s", w.Code, w.Body)
	}
}

// A switch is two to four destructive minutes of rebuilding. The seat
// behind it was granted to a client that could use it, so this only
// catches a device that changed under the session — a laptop closed and
// the tab reopened on a phone.
func TestASwitchToAHandsOnExamIsRefusedOnAPhone(t *testing.T) {
	s, c := hostedWithExams(t, okHandler())
	if w := ready(t, s, c, `{"bank":"ckad-mock-01"}`); w.Code != http.StatusOK {
		t.Fatalf("start: %d %s", w.Code, body(t, w))
	}

	r := coarse(httptest.NewRequest(http.MethodPost, "/api/control/switch", strings.NewReader(`{"bank":"ckad-mock-01"}`)))
	r.AddCookie(c)
	w := do(s, r)

	if w.Code != http.StatusConflict || codeOf(t, w) != codeDesktopRequired {
		t.Fatalf("status = %d code = %q, want 409 %s; body %s", w.Code, codeOf(t, w), codeDesktopRequired, w.Body)
	}
}
