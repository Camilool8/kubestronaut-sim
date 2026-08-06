package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"kubestronaut-sim/hub/internal/auth"
)

const cookieKey = "kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk"

func withIngest(t *testing.T, s *Server) *auth.Signer {
	t.Helper()
	signer, err := auth.NewSigner(auth.Derive([]byte(cookieKey), auth.PurposeIngest))
	if err != nil {
		t.Fatal(err)
	}
	s.Ingest = signer
	return signer
}

func ticket(t *testing.T, signer *auth.Signer, user string, expires time.Time) string {
	t.Helper()
	tok, err := signer.Encode(auth.Session{UserID: user, Expires: expires.Unix()})
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

func ingest(s *Server, tok, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/hub/ingest/history", strings.NewReader(body))
	if tok != "" {
		r.Header.Set("Authorization", "Bearer "+tok)
	}
	return do(s, r)
}

const oneAttempt = `{"record":{"id":"att-1","gradedAt":"2026-08-01T10:00:00Z","percent":72},` +
	`"results":{"bank":"ckad-mock-01","questions":[{"id":"q01"}]}}`

func TestIngestStoresTheAttemptAgainstTheTicketsUser(t *testing.T) {
	s, st := newServer(t, auth.ModeGitHub)
	signer := withIngest(t, s)

	w := ingest(s, ticket(t, signer, "583231", time.Now().Add(time.Hour)), oneAttempt)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", w.Code, w.Body)
	}

	doc, err := st.Document("583231")
	if err != nil {
		t.Fatal(err)
	}
	if len(doc.Attempts) != 1 {
		t.Fatalf("stored %d attempts, want 1", len(doc.Attempts))
	}

	var stored map[string]any
	if err := json.Unmarshal(doc.Attempts[0], &stored); err != nil {
		t.Fatal(err)
	}
	if stored["percent"] != float64(72) {
		t.Errorf("attempt lost fields: %s", doc.Attempts[0])
	}
	res, err := st.Results("583231", "att-1")
	if err != nil {
		t.Fatalf("results were not stored: %v", err)
	}
	if !strings.Contains(string(res), "q01") {
		t.Errorf("results = %s", res)
	}
}

func TestIngestIgnoresAUserNamedInTheBody(t *testing.T) {
	s, st := newServer(t, auth.ModeGitHub)
	signer := withIngest(t, s)

	body := `{"user":"999","uid":"999","record":{"id":"att-1","gradedAt":"2026-08-01T10:00:00Z"}}`
	if w := ingest(s, ticket(t, signer, "583231", time.Now().Add(time.Hour)), body); w.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", w.Code, w.Body)
	}

	doc, err := st.Document("999")
	if err != nil {
		t.Fatal(err)
	}
	if len(doc.Attempts) != 0 {
		t.Fatal("a body field chose the user; a Pod can write into anyone's history")
	}
	doc, _ = st.Document("583231")
	if len(doc.Attempts) != 1 {
		t.Fatalf("the ticket's user got %d attempts, want 1", len(doc.Attempts))
	}
}

func TestATicketIsNotACookieAndACookieIsNotATicket(t *testing.T) {
	s, _ := newServer(t, auth.ModeGitHub)
	signer := withIngest(t, s)

	tok := ticket(t, signer, "583231", time.Now().Add(time.Hour))
	r := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	r.AddCookie(&http.Cookie{Name: "hub_session", Value: tok})
	w := do(s, r)
	var body me
	json.Unmarshal(w.Body.Bytes(), &body)
	if body.Authenticated {
		t.Error("an ingest ticket logged in as its user")
	}

	cookie := login(t, s, "583231", "octocat")
	if w := ingest(s, cookie.Value, oneAttempt); w.Code != http.StatusUnauthorized {
		t.Errorf("a session cookie posted an attempt: status = %d", w.Code)
	}
}

func TestIngestRefusesWhatItCannotTrust(t *testing.T) {
	s, _ := newServer(t, auth.ModeGitHub)
	signer := withIngest(t, s)
	good := ticket(t, signer, "583231", time.Now().Add(time.Hour))

	for name, tc := range map[string]struct {
		tok, body string
		want      int
	}{
		"no ticket":      {"", oneAttempt, http.StatusUnauthorized},
		"forged ticket":  {"nonsense.nonsense", oneAttempt, http.StatusUnauthorized},
		"expired ticket": {ticket(t, signer, "583231", time.Now().Add(-time.Minute)), oneAttempt, http.StatusUnauthorized},
		"not json":       {good, "nope", http.StatusBadRequest},
		"no record":      {good, `{"results":{}}`, http.StatusBadRequest},
	} {
		if w := ingest(s, tc.tok, tc.body); w.Code != tc.want {
			t.Errorf("%s: status = %d, want %d (%s)", name, w.Code, tc.want, w.Body)
		}
	}
}

func TestIngestIsIdempotentOnTheAttemptID(t *testing.T) {
	s, st := newServer(t, auth.ModeGitHub)
	signer := withIngest(t, s)
	tok := ticket(t, signer, "583231", time.Now().Add(time.Hour))

	for i, want := range []bool{true, false} {
		w := ingest(s, tok, oneAttempt)
		if w.Code != http.StatusOK {
			t.Fatalf("delivery %d: status = %d", i, w.Code)
		}
		var body struct {
			Recorded bool `json:"recorded"`
		}
		json.Unmarshal(w.Body.Bytes(), &body)
		if body.Recorded != want {
			t.Errorf("delivery %d: recorded = %v, want %v", i, body.Recorded, want)
		}
	}
	doc, _ := st.Document("583231")
	if len(doc.Attempts) != 1 {
		t.Fatalf("a retried delivery stored %d attempts", len(doc.Attempts))
	}
}

func TestIngestIsNotRegisteredWithoutASigner(t *testing.T) {
	s, _ := newServer(t, auth.ModeGitHub)
	if w := ingest(s, "anything", oneAttempt); w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", w.Code)
	}
}
