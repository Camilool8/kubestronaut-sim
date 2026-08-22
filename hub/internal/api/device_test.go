package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kubestronaut-sim/hub/internal/session"
)

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

	if used := mgr.Seats()[session.Practical][0]; used != 0 {
		t.Errorf("seats used = %d, want 0: the seat must not be claimed and then refused", used)
	}
	if _, err := mgr.Get("583231"); err == nil {
		t.Error("a session was created for a request that was refused")
	}
}

func TestAPhoneMayStillTakeAnMcqSeat(t *testing.T) {
	s, c := hostedWithExams(t, okHandler())

	r := coarse(httptest.NewRequest(http.MethodPost, "/api/session/start", strings.NewReader(`{"bank":"kcna-mock"}`)))
	r.AddCookie(c)
	if w := do(s, r); w.Code == http.StatusConflict && codeOf(t, w) == codeDesktopRequired {
		t.Fatalf("an mcq start was refused as needing a desktop: %s", w.Body)
	}
}

func TestANamedHandsOnExamIsRefusedOnAPhone(t *testing.T) {
	s, c := hostedWithExams(t, okHandler())

	r := coarse(httptest.NewRequest(http.MethodPost, "/api/session/start", strings.NewReader(`{"bank":"ckad-mock-01"}`)))
	r.AddCookie(c)
	w := do(s, r)

	if w.Code != http.StatusConflict || codeOf(t, w) != codeDesktopRequired {
		t.Fatalf("status = %d code = %q, want 409 %s", w.Code, codeOf(t, w), codeDesktopRequired)
	}
}

func TestAClientThatSaysNothingIsStillAdmitted(t *testing.T) {
	s, _ := hosted(t, 1, nil)
	r := httptest.NewRequest(http.MethodPost, "/api/session/start", nil)
	r.AddCookie(login(t, s, "583231", "octocat"))

	if w := do(s, r); w.Code == http.StatusConflict {
		t.Fatalf("a header-less client was refused: %d %s", w.Code, w.Body)
	}
}

func TestAFinePointerIsAdmitted(t *testing.T) {
	s, _ := hosted(t, 1, nil)
	r := httptest.NewRequest(http.MethodPost, "/api/session/start", nil)
	r.Header.Set(pointerHeader, "fine")
	r.AddCookie(login(t, s, "583231", "octocat"))

	if w := do(s, r); w.Code == http.StatusConflict {
		t.Fatalf("a fine-pointer client was refused: %d %s", w.Code, w.Body)
	}
}

// The facilitator's own "begin an attempt" call, made from inside an
// already-admitted MCQ session to choose training/speed/exam, carries no
// bank — the exam is already fixed. It must not fall through to
// DefaultKind (practical) and refuse a touch-only device that was never
// running a desktop to begin with.
func TestAPhoneMayBeginAnAttemptInAnExistingMcqSession(t *testing.T) {
	s, c := hostedWithExams(t, okHandler())
	if w := ready(t, s, c, `{"bank":"kcna-mock"}`); w.Code != http.StatusOK {
		t.Fatalf("start: %d %s", w.Code, body(t, w))
	}

	r := coarse(httptest.NewRequest(http.MethodPost, "/api/session/start", strings.NewReader(`{"mode":"exam"}`)))
	r.AddCookie(c)
	w := do(s, r)

	if w.Code == http.StatusConflict && codeOf(t, w) == codeDesktopRequired {
		t.Fatalf("beginning an attempt in an existing mcq session was refused as needing a desktop: %s", w.Body)
	}
}

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
