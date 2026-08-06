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

func seatOfKind(t *testing.T, kind session.Kind) (*Server, *http.Cookie, *httptest.Server) {
	t.Helper()
	bank := "ckad-mock-01"
	if kind == session.MCQ {
		bank = "kcna-mock"
	}
	return seatFor(t, kind, bank)
}

func seatFor(t *testing.T, kind session.Kind, bank string) (*Server, *http.Cookie, *httptest.Server) {
	t.Helper()
	s, _ := newServer(t, auth.ModeGitHub)
	pod := httptest.NewServer(catalogHandler())
	t.Cleanup(pod.Close)
	u, err := url.Parse(pod.URL)
	if err != nil {
		t.Fatal(err)
	}
	host, port := u.Hostname(), atoi(u.Port())
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

func TestASeatRefusesAnyExamButItsOwn(t *testing.T) {
	s, c, _ := seatFor(t, session.Practical, "ckad-mock-01")

	w := switchTo(s, c, "ckad-mock-02")

	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409: %s", w.Code, body(t, w))
	}
	if got := body(t, w); !strings.Contains(got, "this seat is for one exam") {
		t.Errorf("body = %q, want the one-exam refusal", got)
	}
}

func TestASeatAcceptsItsOwnExam(t *testing.T) {
	s, c, _ := seatFor(t, session.Practical, "ckad-mock-01")

	w := switchTo(s, c, "ckad-mock-01")

	if w.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202: %s", w.Code, body(t, w))
	}
}

func TestAnMcqSeatRefusesAHandsOnExam(t *testing.T) {
	s, c, _ := seatOfKind(t, session.MCQ)

	w := switchTo(s, c, "ckad-mock-01")

	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409: %s", w.Code, body(t, w))
	}
}

func TestAPracticalSeatRefusesAnMcqExam(t *testing.T) {
	s, c, _ := seatOfKind(t, session.Practical)

	w := switchTo(s, c, "kcna-mock")

	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409: %s", w.Code, body(t, w))
	}
}

func TestASeatWithNoRecordedExamStillChecksTheFlavour(t *testing.T) {
	s, c, _ := seatFor(t, session.MCQ, "")

	if w := switchTo(s, c, "ckad-mock-01"); w.Code != http.StatusConflict {
		t.Fatalf("hands-on into an mcq seat: status = %d, want 409: %s", w.Code, body(t, w))
	}

	if w := switchTo(s, c, "kcna-mock"); w.Code != http.StatusAccepted {
		t.Fatalf("mcq into an mcq seat: status = %d, want 202: %s", w.Code, body(t, w))
	}
}

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

func TestAnUnknownExamIsRefused(t *testing.T) {
	s, c, _ := seatFor(t, session.MCQ, "")

	w := switchTo(s, c, "cks-mock-01")

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404: %s", w.Code, body(t, w))
	}
}

func TestAnUnreadableCatalogRefusesTheSwitch(t *testing.T) {
	s, c, pod := seatFor(t, session.MCQ, "")
	pod.Close()

	w := switchTo(s, c, "ckad-mock-01")

	if w.Code == http.StatusAccepted {
		t.Fatalf("an unreadable catalog let the switch through: %s", body(t, w))
	}
}

func TestAResetIsUnaffected(t *testing.T) {
	s, c, _ := seatOfKind(t, session.MCQ)

	r := httptest.NewRequest(http.MethodPost, "/api/control/reset", strings.NewReader(`{}`))
	r.AddCookie(c)
	w := do(s, r)

	if w.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202: %s", w.Code, body(t, w))
	}
}
