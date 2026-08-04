package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"kubestronaut-sim/hub/internal/auth"
	"kubestronaut-sim/hub/internal/session"
)

// The catalog a session Pod serves: every bank the banks image staged,
// which is all of them, whatever kind of Pod is asking. That is the
// condition this gate exists for.
func catalogHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/catalog" {
			w.WriteHeader(http.StatusOK)
			return
		}
		json.NewEncoder(w).Encode(map[string]any{
			"active": "kcna-mock",
			"exams": []map[string]any{
				{"id": "ckad-mock-01", "examType": "hands-on"},
				{"id": "ckad-mock-02", "examType": "hands-on"},
				{"id": "kcna-mock", "examType": "mcq"},
			},
		})
	})
}

// seatOfKind is a candidate holding one seat of the given flavour, with
// their Pod up. The returned server IS that Pod: closing it is how a test
// makes a live session unreachable, which is what a facilitator
// mid-restart looks like from here.
func seatOfKind(t *testing.T, kind session.Kind) (*Server, *http.Cookie, *httptest.Server) {
	t.Helper()
	s, _ := newServer(t, auth.ModeGitHub)
	pod := httptest.NewServer(catalogHandler())
	t.Cleanup(pod.Close)
	u, err := url.Parse(pod.URL)
	if err != nil {
		t.Fatal(err)
	}
	host, port := u.Hostname(), atoi(u.Port())
	bank := "ckad-mock-01"
	if kind == session.MCQ {
		bank = "kcna-mock"
	}
	s.Sessions = session.New(&session.Static{Host: host}, session.Config{
		Flavours: map[session.Kind]session.Flavour{
			kind: {Seats: 1, Template: session.Template(podTemplate), Bank: bank},
		},
		Port: port,
		Logf: func(string, ...any) {},
	})
	s.DefaultKind = kind
	s.UI = shellFS()

	c := login(t, s, "u1", "candidate")
	if w := ready(t, s, c, `{}`); w.Code != http.StatusOK {
		t.Fatalf("starting a %s session: %d %s", kind, w.Code, body(t, w))
	}
	return s, c, pod
}

func switchTo(s *Server, c *http.Cookie, bank string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/api/control/switch",
		strings.NewReader(`{"bank":"`+bank+`"}`))
	r.AddCookie(c)
	return do(s, r)
}

// The bug. An MCQ seat is two containers and no cluster; switching its
// bank does not switch its template, so a hands-on exam chosen here
// booted the hands-on bank into a Pod with no instances and no desktop,
// graded every check 0 with "could not resolve hostname instance-1", and
// recorded it as a real attempt.
func TestAnMcqSeatRefusesAHandsOnExam(t *testing.T) {
	s, c, _ := seatOfKind(t, session.MCQ)

	w := switchTo(s, c, "ckad-mock-01")

	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409: %s", w.Code, body(t, w))
	}
	if got := body(t, w); !strings.Contains(got, "cannot run that exam") {
		t.Errorf("body = %q, want the seat refusal", got)
	}
}

// The mirror, so the gate is not accidentally one-directional: a
// hands-on seat has no business rebuilding itself onto a question bank
// either, and the reason is the same one in reverse.
func TestAPracticalSeatRefusesAnMcqExam(t *testing.T) {
	s, c, _ := seatOfKind(t, session.Practical)

	w := switchTo(s, c, "kcna-mock")

	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409: %s", w.Code, body(t, w))
	}
}

// Refused before anything is destroyed: the session must survive intact,
// which is the rule canRestart() enforces for an operation that cannot
// finish.
func TestARefusedSwitchLeavesTheSessionRunning(t *testing.T) {
	s, c, _ := seatOfKind(t, session.MCQ)

	switchTo(s, c, "ckad-mock-01")

	live, err := s.Sessions.Get("u1")
	if err != nil {
		t.Fatalf("the session is gone: %v", err)
	}
	if live.State != session.Ready {
		t.Errorf("state = %q, want the session still ready", live.State)
	}
}

// Same kind, different bank: a practical seat may move between hands-on
// exams, because the Pod that needs is the one it already has. The gate
// is on the flavour, not on the bank the seat happened to start with.
func TestAPracticalSeatMayMoveBetweenHandsOnExams(t *testing.T) {
	s, c, _ := seatOfKind(t, session.Practical)

	w := switchTo(s, c, "ckad-mock-02")

	if w.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202: %s", w.Code, body(t, w))
	}
}

// An exam no catalog knows is a 404, not a rebuild onto a bank that does
// not exist.
func TestAnUnknownExamIsRefused(t *testing.T) {
	s, c, _ := seatOfKind(t, session.MCQ)

	w := switchTo(s, c, "cks-mock-01")

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404: %s", w.Code, body(t, w))
	}
}

// Fail closed. Not knowing whether a hands-on bank is about to be booted
// into a Pod with no cluster is not a reason to try it and find out.
func TestAnUnreadableCatalogRefusesTheSwitch(t *testing.T) {
	s, c, pod := seatOfKind(t, session.MCQ)
	pod.Close()

	w := switchTo(s, c, "ckad-mock-01")

	if w.Code == http.StatusAccepted {
		t.Fatalf("an unreadable catalog let the switch through: %s", body(t, w))
	}
}

// A reset carries no bank and never reaches the gate.
func TestAResetIsUnaffected(t *testing.T) {
	s, c, _ := seatOfKind(t, session.MCQ)

	r := httptest.NewRequest(http.MethodPost, "/api/control/reset", strings.NewReader(`{}`))
	r.AddCookie(c)
	w := do(s, r)

	if w.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202: %s", w.Code, body(t, w))
	}
}
