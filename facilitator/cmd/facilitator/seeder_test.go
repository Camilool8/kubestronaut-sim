package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kubestronaut-sim/facilitator/internal/api"
)

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
