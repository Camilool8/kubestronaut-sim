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

func quietMirror(t *testing.T, url, token string) *mirror {
	t.Helper()
	m := newMirror(url, token, "", nil, func(string, ...any) {})
	m.sleep = func(time.Duration) {}
	return m
}

func historyRecord() history.Record {
	return history.Record{ID: "tok-1", Bank: "ckad-mock-01", Mode: session.ModeExam}
}

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

	raw, _ := json.Marshal(body)
	for _, forbidden := range []string{"user", "uid", "login"} {
		if strings.Contains(strings.ToLower(string(raw)), `"`+forbidden+`"`) {
			t.Errorf("the posted body names a %q; identity must come from the ticket alone", forbidden)
		}
	}
}

func TestMirrorPostsTheReferenceSolutionsWithTheAttempt(t *testing.T) {
	var body struct {
		Results struct {
			Questions []struct {
				ID       string `json:"id"`
				Solution string `json:"solution"`
			} `json:"questions"`
		} `json:"results"`
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&body)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	m := newMirror(srv.URL, "tok", bankWithSolutions(t, "q01", "q02"), recorderExam(), func(string, ...any) {})
	m.sleep = func(time.Duration) {}
	if err := m.post(t.Context(), historyRecord(), gradedResults()); err != nil {
		t.Fatalf("post: %v", err)
	}

	if len(body.Results.Questions) != 2 {
		t.Fatalf("questions = %d, want 2", len(body.Results.Questions))
	}
	for _, q := range body.Results.Questions {
		if q.Solution == "" {
			t.Errorf("%s was stored with no reference solution", q.ID)
		}
	}
}

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

func TestNoWebhookURLMeansNoMirror(t *testing.T) {
	if m := newMirror("", "tok", "", nil, nil); m != nil {
		t.Errorf("newMirror with no URL returned %+v", m)
	}
}
