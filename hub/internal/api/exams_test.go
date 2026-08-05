package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kubestronaut-sim/hub/internal/auth"
	"kubestronaut-sim/hub/internal/catalog"
	"kubestronaut-sim/hub/internal/session"
)

// The bank index as the banks image stages it, with one exam of each
// engine plus one that cannot be sat.
func testBanks(t *testing.T) *catalog.Catalog {
	t.Helper()
	dir := t.TempDir()
	for name, doc := range map[string]string{
		"ckad-mock-01.json": `{"metadata":{"name":"ckad-mock-01","title":"CKAD Mock Exam 01","certification":"CKAD"},
		  "spec":{"examType":"hands-on","duration":"120m","passingScore":66,
		          "instances":[{"name":"instance-1"},{"name":"instance-2"}],"questions":[{"id":"q01"}]}}`,
		"kcna-mock.json": `{"metadata":{"name":"kcna-mock","title":"KCNA Mock Exam","certification":"KCNA"},
		  "spec":{"examType":"mcq","duration":"90m","passingScore":75,"questions":[{"id":"q01"}]}}`,
		"_catalog.json": `{"comingSoon":[{"id":"cks-mock","title":"CKS Mock Exam","certification":"CKS",
		  "examType":"hands-on","note":"Not written yet"}]}`,
	} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(doc), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	c, err := catalog.Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

// hostedWithExams is `hosted` plus a bank index and both flavours, which
// is what a deployment that lets candidates choose actually looks like.
func hostedWithExams(t *testing.T, upstream http.Handler) (*Server, *http.Cookie) {
	t.Helper()
	s, _ := newServer(t, auth.ModeGitHub)
	srv := httptest.NewServer(upstream)
	t.Cleanup(srv.Close)
	u, err := url.Parse(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	s.Banks = testBanks(t)
	s.Sessions = session.New(&session.Static{Host: u.Hostname()}, session.Config{
		Flavours: map[session.Kind]session.Flavour{
			session.Practical: {Seats: 1, Template: session.Template(podTemplate), Bank: "ckad-mock-01"},
			session.MCQ:       {Seats: 1, Template: session.Template(podTemplate), Bank: "kcna-mock"},
		},
		Port: atoi(u.Port()),
		Logf: func(string, ...any) {},
	})
	s.DefaultKind = session.Practical
	s.UI = shellFS()
	return s, login(t, s, "u1", "candidate")
}

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
}

type exameRow struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Kind       string `json:"kind"`
	ExamType   string `json:"examType"`
	Available  bool   `json:"available"`
	ComingSoon bool   `json:"comingSoon"`
}

func getExams(t *testing.T, s *Server) []exameRow {
	t.Helper()
	w := do(s, httptest.NewRequest(http.MethodGet, "/hub/exams", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("GET /hub/exams: status = %d: %s", w.Code, body(t, w))
	}
	var payload struct {
		Exams []exameRow `json:"exams"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode: %v (body %s)", err, w.Body.String())
	}
	return payload.Exams
}

// The lobby's whole problem: the candidate is choosing a certification
// and has no session Pod yet, so there is nothing running to ask. This
// is the answer, and it must work signed out — somebody deciding whether
// to sign in is entitled to see whether the exam they came for is here.
func TestExamsAreListedWithoutASession(t *testing.T) {
	s, _ := hostedWithExams(t, okHandler())

	exams := getExams(t, s)
	byID := map[string]exameRow{}
	for _, e := range exams {
		byID[e.ID] = e
	}
	if len(byID) != 3 {
		t.Fatalf("got %d exams, want 3: %+v", len(byID), exams)
	}
	// The seat pool each card competes for, derived by the hub from the
	// bank's own engine rather than by the browser.
	if byID["ckad-mock-01"].Kind != "practical" {
		t.Errorf("ckad kind = %q, want practical", byID["ckad-mock-01"].Kind)
	}
	if byID["kcna-mock"].Kind != "mcq" {
		t.Errorf("kcna kind = %q, want mcq", byID["kcna-mock"].Kind)
	}
	if cks := byID["cks-mock"]; cks.Available || !cks.ComingSoon {
		t.Errorf("cks = %+v, want an unavailable coming-soon row", cks)
	}
}

// A deployment that staged no index still answers, with nothing in it:
// the lobby then falls back to offering a flavour, exactly as it did
// before exams were choosable.
func TestExamsAnswersEmptyWithNoIndex(t *testing.T) {
	s, _ := newServer(t, auth.ModeGitHub)

	w := do(s, httptest.NewRequest(http.MethodGet, "/hub/exams", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	// [] and never null: a lobby that renders `null.map` shows nothing at
	// all, which is indistinguishable from a hub that is down.
	if got := strings.TrimSpace(w.Body.String()); !strings.Contains(got, `"exams":[]`) {
		t.Errorf("body = %s, want an empty exams array", got)
	}
}

// The exam decides the seat. The candidate picked a certification, not a
// flavour, and the flavour is derived from the bank's own engine — the
// same mapping the seat guard enforces on a switch.
func TestStartingAnMcqExamTakesAnMcqSeat(t *testing.T) {
	s, c := hostedWithExams(t, okHandler())

	if w := ready(t, s, c, `{"bank":"kcna-mock"}`); w.Code != http.StatusOK {
		t.Fatalf("start: %d %s", w.Code, body(t, w))
	}

	live, err := s.Sessions.Get("u1")
	if err != nil {
		t.Fatalf("no session: %v", err)
	}
	if live.Kind != session.MCQ {
		t.Errorf("kind = %q, want mcq: the bank's engine decides the seat", live.Kind)
	}
	if live.Bank != "kcna-mock" {
		t.Errorf("bank = %q, want kcna-mock", live.Bank)
	}
}

// A `kind` that disagrees with the named exam loses. The exam is the
// fact the candidate expressed; the flavour is derived from it, so
// refusing over a field they should not have had to send would be a
// refusal about the client's bookkeeping.
func TestANamedExamOverridesADisagreeingKind(t *testing.T) {
	s, c := hostedWithExams(t, okHandler())

	if w := ready(t, s, c, `{"kind":"practical","bank":"kcna-mock"}`); w.Code != http.StatusOK {
		t.Fatalf("start: %d %s", w.Code, body(t, w))
	}
	live, _ := s.Sessions.Get("u1")
	if live.Kind != session.MCQ {
		t.Errorf("kind = %q, want mcq", live.Kind)
	}
}

// Refused before a seat is spent. An unknown bank stamped into a Pod is
// twenty minutes of boot ending in a facilitator with no exam loaded,
// and the candidate would have paid a seat and a place in the queue to
// discover it.
func TestAnUnknownExamIsRefusedBeforeAdmission(t *testing.T) {
	s, c := hostedWithExams(t, okHandler())

	r := httptest.NewRequest(http.MethodPost, "/api/session/start", strings.NewReader(`{"bank":"nope-mock"}`))
	r.AddCookie(c)
	w := do(s, r)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400: %s", w.Code, body(t, w))
	}
	if _, err := s.Sessions.Get("u1"); err == nil {
		t.Error("a seat was granted for an exam that does not exist")
	}
}

// A coming-soon certification has no bank behind it. It is listed so a
// candidate can see it is on the path; it must not be startable.
func TestAComingSoonExamCannotBeStarted(t *testing.T) {
	s, c := hostedWithExams(t, okHandler())

	r := httptest.NewRequest(http.MethodPost, "/api/session/start", strings.NewReader(`{"bank":"cks-mock"}`))
	r.AddCookie(c)
	w := do(s, r)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400: %s", w.Code, body(t, w))
	}
}

// The conductor inside a session still runs one job of its own: seeding
// a pooled bank's drawn questions, triggered by the facilitator
// server-to-server between Start and the clock beginning. The hub
// answers control status from ITS store, so that job was invisible and
// the candidate watched a blank hold.
func TestAConductorJobInTheSessionIsReportedThrough(t *testing.T) {
	s, c := hostedWithExams(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/control/status":
			w.Write([]byte(`{"busy":true,"job":{"id":"seed-1","op":"seed","bank":"ckad-mock-01","phases":[]}}`))
		case "/api/control/log":
			w.Write([]byte(`{"jobId":"seed-1","lines":["setting up q04"]}`))
		default:
			w.WriteHeader(http.StatusOK)
		}
	}))
	if w := ready(t, s, c, `{"bank":"ckad-mock-01"}`); w.Code != http.StatusOK {
		t.Fatalf("start: %d %s", w.Code, body(t, w))
	}

	for path, needle := range map[string]string{
		"/api/control/status": "seed",
		"/api/control/log":    "setting up q04",
	} {
		r := httptest.NewRequest(http.MethodGet, path, nil)
		r.AddCookie(c)
		w := do(s, r)
		if w.Code != http.StatusOK {
			t.Fatalf("GET %s: %d", path, w.Code)
		}
		if got := body(t, w); !strings.Contains(got, needle) {
			t.Errorf("GET %s = %s, want the conductor's own job", path, got)
		}
	}
}

// The hub's own operations still win. A reset is Pod replacement: the
// Pod is gone for most of it, so an answer from the Pod would be either
// unreachable or about the Pod that is being thrown away.
func TestTheHubsOwnJobWinsOverThePods(t *testing.T) {
	s, c := hostedWithExams(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/control/status" {
			w.Write([]byte(`{"busy":true,"job":{"id":"seed-1","op":"seed","phases":[]}}`))
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	if w := ready(t, s, c, `{"bank":"ckad-mock-01"}`); w.Code != http.StatusOK {
		t.Fatalf("start: %d %s", w.Code, body(t, w))
	}

	reset := httptest.NewRequest(http.MethodPost, "/api/control/reset", strings.NewReader(`{}`))
	reset.AddCookie(c)
	if w := do(s, reset); w.Code != http.StatusAccepted {
		t.Fatalf("reset: %d %s", w.Code, body(t, w))
	}

	r := httptest.NewRequest(http.MethodGet, "/api/control/status", nil)
	r.AddCookie(c)
	got := body(t, do(s, r))
	if strings.Contains(got, "seed-1") {
		t.Errorf("status = %s, want the hub's own reset job", got)
	}
}

// The old client, and the old deployment: no bank in the body means the
// flavour's configured default, which is what sessions.<kind>.bank has
// always been. Nothing about this may have changed.
func TestNoNamedExamFallsBackToTheFlavourDefault(t *testing.T) {
	s, c := hostedWithExams(t, okHandler())

	if w := ready(t, s, c, `{"kind":"practical"}`); w.Code != http.StatusOK {
		t.Fatalf("start: %d %s", w.Code, body(t, w))
	}
	live, _ := s.Sessions.Get("u1")
	if live.Bank != "ckad-mock-01" {
		t.Errorf("bank = %q, want the flavour default ckad-mock-01", live.Bank)
	}
}
