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
	bank := "ckad-mock-01"
	if kind == session.MCQ {
		bank = "kcna-mock"
	}
	return seatFor(t, kind, bank)
}

// seatFor is seatOfKind with the seat's exam named, including as "" —
// which is a session that records no exam at all. That is not a
// hypothetical: it is what a Pod adopted from before exams were
// choosable looks like, and it is the case the flavour check underneath
// the bank check exists for.
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

// A seat is one exam.
//
// The candidate chose the certification in the lobby, and the Pod was
// created and sized for it. Rebuilding it onto a different exam would
// hand them an environment they were never admitted for — and would do
// it silently, since the two hands-on exams look identical from inside
// the session. The answer to "I want a different exam" is a new session.
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

// The same request naming the seat's own exam is not a refusal: it is
// the reseed a candidate gets by asking for the exam they are already
// sitting, and it must go through the ordinary recycle.
func TestASeatAcceptsItsOwnExam(t *testing.T) {
	s, c, _ := seatFor(t, session.Practical, "ckad-mock-01")

	w := switchTo(s, c, "ckad-mock-01")

	if w.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202: %s", w.Code, body(t, w))
	}
}

// The bug this gate was built for. An MCQ seat is two containers and no
// cluster; switching its bank does not switch its template, so a
// hands-on exam chosen here booted the hands-on bank into a Pod with no
// instances and no desktop, graded every check 0 with "could not resolve
// hostname instance-1", and recorded it as a real attempt.
//
// Refused by the one-exam rule now rather than by the flavour rule, and
// the test stays because what must never happen is unchanged.
func TestAnMcqSeatRefusesAHandsOnExam(t *testing.T) {
	s, c, _ := seatOfKind(t, session.MCQ)

	w := switchTo(s, c, "ckad-mock-01")

	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409: %s", w.Code, body(t, w))
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

// A session that records no exam — a Pod adopted from before exams were
// choosable — cannot be checked against its own bank, so it falls
// through to the flavour check that was the whole rule before. It must
// not fall through to no check at all.
func TestASeatWithNoRecordedExamStillChecksTheFlavour(t *testing.T) {
	s, c, _ := seatFor(t, session.MCQ, "")

	if w := switchTo(s, c, "ckad-mock-01"); w.Code != http.StatusConflict {
		t.Fatalf("hands-on into an mcq seat: status = %d, want 409: %s", w.Code, body(t, w))
	}
	// And the same-flavour move it always allowed still works, so the
	// fallback is the old rule intact rather than a blanket refusal.
	if w := switchTo(s, c, "kcna-mock"); w.Code != http.StatusAccepted {
		t.Fatalf("mcq into an mcq seat: status = %d, want 202: %s", w.Code, body(t, w))
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

// An exam no catalog knows is a 404, not a rebuild onto a bank that does
// not exist. Reached through a seat with no recorded exam, since a seat
// that has one never gets as far as the catalog.
func TestAnUnknownExamIsRefused(t *testing.T) {
	s, c, _ := seatFor(t, session.MCQ, "")

	w := switchTo(s, c, "cks-mock-01")

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404: %s", w.Code, body(t, w))
	}
}

// Fail closed. Not knowing whether a hands-on bank is about to be booted
// into a Pod with no cluster is not a reason to try it and find out.
func TestAnUnreadableCatalogRefusesTheSwitch(t *testing.T) {
	s, c, pod := seatFor(t, session.MCQ, "")
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
