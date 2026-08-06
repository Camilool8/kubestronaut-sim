package kube

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newClient(t *testing.T, h http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return &Client{BaseURL: srv.URL, Namespace: "kubestronaut-sim", Token: "tok", HTTP: srv.Client()}
}

func TestCreateGetDeleteList(t *testing.T) {
	var seen []string
	c := newClient(t, func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.Method+" "+r.URL.Path+"?"+r.URL.RawQuery)
		if got := r.Header.Get("Authorization"); got != "Bearer tok" {
			t.Errorf("Authorization = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost:
			w.WriteHeader(http.StatusCreated)
			w.Write([]byte(`{"metadata":{"name":"sim-1"},"status":{"phase":"Pending"}}`))
		case r.Method == http.MethodDelete:
			w.Write([]byte(`{"kind":"Status","status":"Success"}`))
		case strings.HasSuffix(r.URL.Path, "/pods"):
			w.Write([]byte(`{"items":[{"metadata":{"name":"sim-1"}},{"metadata":{"name":"sim-2"}}]}`))
		default:
			w.Write([]byte(`{"metadata":{"name":"sim-1"},"status":{"phase":"Running","podIP":"10.42.0.7","containerStatuses":[{"name":"facilitator","ready":true},{"name":"desktop","ready":false}]}}`))
		}
	})
	ctx := context.Background()

	if _, err := c.CreatePod(ctx, []byte(`{"kind":"Pod"}`)); err != nil {
		t.Fatal(err)
	}
	pod, err := c.GetPod(ctx, "sim-1")
	if err != nil {
		t.Fatal(err)
	}
	if pod.Status.PodIP != "10.42.0.7" {
		t.Errorf("podIP = %q", pod.Status.PodIP)
	}

	if !pod.Ready("facilitator") {
		t.Error("facilitator should be ready")
	}
	if pod.Ready("desktop") {
		t.Error("desktop should not be ready")
	}
	if pod.Ready("nonexistent") {
		t.Error("a container that is not in the status cannot be ready")
	}
	if err := c.DeletePod(ctx, "sim-1"); err != nil {
		t.Fatal(err)
	}
	pods, err := c.ListPods(ctx, "kubestronaut-sim/user")
	if err != nil {
		t.Fatal(err)
	}
	if len(pods) != 2 {
		t.Fatalf("listed %d pods, want 2", len(pods))
	}

	want := []string{
		"POST /api/v1/namespaces/kubestronaut-sim/pods?",
		"GET /api/v1/namespaces/kubestronaut-sim/pods/sim-1?",
		"DELETE /api/v1/namespaces/kubestronaut-sim/pods/sim-1?",
		"GET /api/v1/namespaces/kubestronaut-sim/pods?labelSelector=kubestronaut-sim%2Fuser",
	}
	for i := range want {
		if i >= len(seen) || seen[i] != want[i] {
			t.Errorf("request %d = %q, want %q", i, seen[i], want[i])
		}
	}
}

func TestStatusesMapToSentinels(t *testing.T) {
	for _, tc := range []struct {
		code int
		want error
	}{
		{http.StatusNotFound, ErrNotFound},
		{http.StatusConflict, ErrConflict},
		{http.StatusForbidden, ErrForbidden},
	} {
		c := newClient(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(tc.code)
			w.Write([]byte(`{"kind":"Status","message":"pods is forbidden: no permission"}`))
		})
		_, err := c.GetPod(context.Background(), "sim-1")
		if !errors.Is(err, tc.want) {
			t.Errorf("%d gave %v, want %v", tc.code, err, tc.want)
		}
	}
}

func TestForbiddenKeepsTheAPIServersExplanation(t *testing.T) {
	c := newClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte(`{"kind":"Status","message":"pods is forbidden: User \"system:serviceaccount:kubestronaut-sim:hub\" cannot create resource \"pods\""}`))
	})
	_, err := c.CreatePod(context.Background(), []byte(`{}`))
	if err == nil || !strings.Contains(err.Error(), "cannot create resource") {
		t.Errorf("err = %v, want the API server's own message", err)
	}
}

func TestTokenIsRereadAfterRotation(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "token")
	if err := os.WriteFile(path, []byte("first\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	var got []string
	c := newClient(t, func(w http.ResponseWriter, r *http.Request) {
		got = append(got, r.Header.Get("Authorization"))
		w.Write([]byte(`{}`))
	})
	c.Token, c.TokenFile = "", path

	if _, err := c.GetPod(context.Background(), "a"); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(path, []byte("second\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	c.mu.Lock()
	c.lastRead = time.Now().Add(-time.Hour)
	c.mu.Unlock()

	if _, err := c.GetPod(context.Background(), "a"); err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0] != "Bearer first" || got[1] != "Bearer second" {
		t.Errorf("authorization headers = %q, want first then second", got)
	}
}
