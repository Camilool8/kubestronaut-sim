package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"kubestronaut-sim/facilitator/internal/history"
	"kubestronaut-sim/facilitator/internal/session"
)

// quietMirror is a mirror pointed at url with the retry pause removed,
// so a test of three attempts costs no seconds.
func quietMirror(t *testing.T, url, token string) *mirror {
	t.Helper()
	m := newMirror(url, token, func(string, ...any) {})
	m.sleep = func(time.Duration) {}
	return m
}

func historyRecord() history.Record {
	return history.Record{ID: "tok-1", Bank: "ckad-mock-01", Mode: session.ModeExam}
}

// The whole point of the mirror: the hub receives the record AND the
// full results document. A record alone would give a hosted candidate a
// score in their history with nothing behind it, because the review
// screen renders from the results' per-check artifacts.
func TestMirrorPostsTheRecordAndTheFullResults(t *testing.T) {
	var gotAuth, gotType string
	var body struct {
		Record  map[string]any `json:"record"`
		Results map[string]any `json:"results"`
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth, gotType = r.Header.Get("Authorization"), r.Header.Get("Content-Type")
		json.NewDecoder(r.Body).Decode(&body)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	store := newTestStore(t)
	snap := session.Snapshot{State: "ended", Mode: session.ModeExam}
	if err := recordAttempt(store, quietMirror(t, srv.URL, "tok"), recorderExam(), "tok-1", snap, gradedResults()); err != nil {
		t.Fatalf("recordAttempt: %v", err)
	}

	if gotAuth != "Bearer tok" {
		t.Errorf("Authorization = %q", gotAuth)
	}
	if gotType != "application/json" {
		t.Errorf("Content-Type = %q", gotType)
	}
	if body.Record["id"] != "tok-1" {
		t.Errorf("record id = %v", body.Record["id"])
	}
	if body.Results == nil {
		t.Fatal("the results document was not sent; a hosted attempt would have no review")
	}
	if _, ok := body.Results["questions"]; !ok {
		t.Errorf("results carry no questions: %v", body.Results)
	}
	// Nothing in the body names a user. The ticket does, and only the
	// ticket may — a Pod that could name its own user could write into
	// anyone's history.
	raw, _ := json.Marshal(body)
	for _, forbidden := range []string{"user", "uid", "login"} {
		if strings.Contains(strings.ToLower(string(raw)), `"`+forbidden+`"`) {
			t.Errorf("the posted body names a %q; identity must come from the ticket alone", forbidden)
		}
	}
}

// A hub that is down must not also cost the candidate the copy on their
// own disk. The local write comes first and its success is not
// conditional on the remote one.
func TestMirrorFailureStillLeavesTheLocalRecord(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "down", http.StatusBadGateway)
	}))
	defer srv.Close()

	store := newTestStore(t)
	snap := session.Snapshot{State: "ended", Mode: session.ModeExam}
	err := recordAttempt(store, quietMirror(t, srv.URL, "tok"), recorderExam(), "tok-1", snap, gradedResults())
	if err == nil {
		t.Fatal("a failed mirror must be reported, not swallowed")
	}
	if got := len(store.All()); got != 1 {
		t.Fatalf("local history has %d attempts, want 1", got)
	}
}

func TestMirrorRetriesAServerErrorAndGivesUp(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		http.Error(w, "restarting", http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	if err := quietMirror(t, srv.URL, "tok").post(t.Context(), historyRecord(), gradedResults()); err == nil {
		t.Fatal("post returned nil after every attempt failed")
	}
	if got := calls.Load(); got != mirrorAttempts {
		t.Errorf("delivered %d times, want %d", got, mirrorAttempts)
	}
}

func TestMirrorRetryRecoversFromARestartingHub(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			http.Error(w, "restarting", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	if err := quietMirror(t, srv.URL, "tok").post(t.Context(), historyRecord(), gradedResults()); err != nil {
		t.Fatalf("post: %v", err)
	}
	if got := calls.Load(); got != 2 {
		t.Errorf("delivered %d times, want 2", got)
	}
}

// A rejected ticket is this build disagreeing with that hub. Retrying
// sends identical bytes to an identical answer, and in a hosted session
// that is three times the delay before the candidate's own log says
// what is wrong.
func TestMirrorDoesNotRetryARejectedTicket(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		http.Error(w, "that ticket is not valid", http.StatusUnauthorized)
	}))
	defer srv.Close()

	err := quietMirror(t, srv.URL, "bad").post(t.Context(), historyRecord(), gradedResults())
	if err == nil {
		t.Fatal("a rejected ticket returned nil")
	}
	if got := calls.Load(); got != 1 {
		t.Errorf("delivered %d times, want 1", got)
	}
}

// Unset is what `./sim up` runs, and it must produce no mirror at all —
// not a mirror that posts nowhere.
func TestNoWebhookURLMeansNoMirror(t *testing.T) {
	if m := newMirror("", "tok", nil); m != nil {
		t.Errorf("newMirror with no URL returned %+v", m)
	}
}
