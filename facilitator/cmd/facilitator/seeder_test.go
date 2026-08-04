package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kubestronaut-sim/facilitator/internal/api"
)

// newConductorSeeder must reach exactly two conductor routes, POST the
// drawn ids to the first and read the job id back.
func TestConductorSeederStart(t *testing.T) {
	var gotPath, gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		buf := make([]byte, 256)
		n, _ := r.Body.Read(buf)
		gotBody = string(buf[:n])
		w.WriteHeader(http.StatusAccepted)
		w.Write([]byte(`{"job":{"id":"job-4","op":"seed"}}`))
	}))
	defer srv.Close()

	s := newConductorSeeder(mustParseURL(t, srv.URL), nil)
	id, err := s.Start(t.Context(), []string{"q03", "q01"})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if gotPath != "/api/control/seed" {
		t.Errorf("posted to %q, want /api/control/seed", gotPath)
	}
	if !strings.Contains(gotBody, `"q03"`) || !strings.Contains(gotBody, `"q01"`) {
		t.Errorf("body = %q, want the drawn ids", gotBody)
	}
	if id != "job-4" {
		t.Errorf("job id = %q, want job-4", id)
	}
}

// The conductor's own refusal reaches the candidate. "409" tells them
// nothing; "another control operation is in flight" tells them to wait.
func TestConductorSeederStartSurfacesTheConductorsReason(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusConflict)
		w.Write([]byte(`{"error":"another control operation is in flight"}`))
	}))
	defer srv.Close()

	s := newConductorSeeder(mustParseURL(t, srv.URL), nil)
	_, err := s.Start(t.Context(), []string{"q01"})
	if err == nil {
		t.Fatal("Start accepted a 409")
	}
	if !strings.Contains(err.Error(), "another control operation") {
		t.Errorf("error = %v, want the conductor's own words", err)
	}
}

// The four outcomes the watcher branches on, read off the conductor's
// single-job snapshot. The last one — a job the conductor has never
// heard of — is the one that matters most: it must be neither "done"
// (which would start an exam against an unprepared cluster) nor
// "running" (which would hang the candidate forever).
func TestConductorSeederStatus(t *testing.T) {
	cases := []struct {
		name  string
		body  string
		want  api.SeedState
		hasMs bool
	}{
		{"running", `{"busy":true,"job":{"id":"job-4"}}`, api.SeedRunning, false},
		{"done", `{"busy":false,"lastJob":{"id":"job-4"}}`, api.SeedDone, false},
		{"failed", `{"busy":false,"lastJob":{"id":"job-4","error":"seeding q02 failed"}}`, api.SeedFailed, true},
		{"another job displaced it", `{"busy":true,"job":{"id":"job-9"},"lastJob":{"id":"job-7"}}`, api.SeedUnknown, false},
		{"conductor restarted", `{"busy":false}`, api.SeedUnknown, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var gotPath string
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotPath = r.URL.Path
				w.Write([]byte(c.body))
			}))
			defer srv.Close()

			s := newConductorSeeder(mustParseURL(t, srv.URL), nil)
			got, err := s.Status(t.Context(), "job-4")
			if err != nil {
				t.Fatalf("Status: %v", err)
			}
			if gotPath != "/api/control/status" {
				t.Errorf("read %q, want /api/control/status", gotPath)
			}
			if got.State != c.want {
				t.Errorf("State = %q, want %q", got.State, c.want)
			}
			if c.hasMs && got.Error == "" {
				t.Error("a failed job carried no message")
			}
		})
	}
}
