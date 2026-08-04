package session

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"kubestronaut-sim/hub/internal/kube"
)

// The adapter's only real job, and the one that fails silently.
//
// The manager decides "already gone, carry on" and "name taken, wait for
// it" with errors.Is against its own sentinels. A kube.ErrNotFound that
// arrives untranslated is just an unknown error, and the visible symptom
// is a reset that waits out its whole timeout for a Pod that vanished
// instantly — twenty minutes of a progress bar that was finished before
// it started.
func TestKubePodsTranslatesEveryStatusTheManagerBranchesOn(t *testing.T) {
	for name, tc := range map[string]struct {
		code int
		call func(*KubePods) error
		want error
	}{
		"get on a missing pod": {http.StatusNotFound, func(k *KubePods) error {
			_, err := k.Get(context.Background(), "sim-1")
			return err
		}, ErrPodGone},
		"delete on a missing pod": {http.StatusNotFound, func(k *KubePods) error {
			return k.Delete(context.Background(), "sim-1")
		}, ErrPodGone},
		"create onto a taken name": {http.StatusConflict, func(k *KubePods) error {
			return k.Create(context.Background(), []byte(`{"kind":"Pod"}`))
		}, ErrPodExists},
	} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(tc.code)
			w.Write([]byte(`{"kind":"Status","message":"nope"}`))
		}))
		k := &KubePods{
			Client:         &kube.Client{BaseURL: srv.URL, Namespace: "ns", Token: "t", HTTP: srv.Client()},
			ReadyContainer: "facilitator",
		}
		if err := tc.call(k); !errors.Is(err, tc.want) {
			t.Errorf("%s: err = %v, want %v", name, err, tc.want)
		}
		srv.Close()
	}
}

// Readiness is per-container: the hub proxies to the facilitator, and a
// desktop still coming up is a normal moment during boot rather than a
// reason to withhold a working session.
func TestKubePodsConvertsWhatTheManagerReads(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"metadata":{"name":"sim-1","labels":{"kubestronaut-sim/user":"583231"},
		  "creationTimestamp":"2026-08-03T10:00:00Z","deletionTimestamp":"2026-08-03T11:00:00Z"},
		  "status":{"phase":"Running","podIP":"10.42.0.9",
		  "containerStatuses":[{"name":"facilitator","ready":true},{"name":"desktop","ready":false}]}}`))
	}))
	defer srv.Close()
	k := &KubePods{
		Client:         &kube.Client{BaseURL: srv.URL, Namespace: "ns", Token: "t", HTTP: srv.Client()},
		ReadyContainer: "facilitator",
	}
	pod, err := k.Get(context.Background(), "sim-1")
	if err != nil {
		t.Fatal(err)
	}
	if !pod.Ready {
		t.Error("a ready facilitator should make the session usable")
	}
	if pod.IP != "10.42.0.9" || pod.Labels["kubestronaut-sim/user"] != "583231" {
		t.Errorf("pod = %+v", pod)
	}
	// A deletionTimestamp is set the moment a delete is accepted, and Get
	// keeps succeeding for the whole grace period. Treating a
	// terminating Pod as live is how a seat stays occupied by something
	// already dying.
	if !pod.Terminating {
		t.Error("a pod with a deletionTimestamp is not live")
	}
	if pod.CreatedAt.IsZero() {
		t.Error("creationTimestamp did not survive: the hard age cap depends on it")
	}
}

// Static is what makes the hub runnable on a laptop, and its value
// depends on the lifecycle being real rather than always-succeeds — a
// Delete that does not delete leaves the recycle path waiting forever
// for a Pod that never goes away.
func TestStaticTracksExistenceSoRecycleTerminates(t *testing.T) {
	s := &Static{Host: "127.0.0.1"}
	ctx := context.Background()
	spec := []byte(`{"metadata":{"name":"sim-session-practical-local"}}`)

	if _, err := s.Get(ctx, "sim-session-practical-local"); !errors.Is(err, ErrPodGone) {
		t.Fatalf("a pod that was never created: %v", err)
	}
	if err := s.Create(ctx, spec); err != nil {
		t.Fatal(err)
	}
	if err := s.Create(ctx, spec); !errors.Is(err, ErrPodExists) {
		t.Errorf("creating the same name twice: %v", err)
	}
	pod, err := s.Get(ctx, "sim-session-practical-local")
	if err != nil || !pod.Ready || pod.IP != "127.0.0.1" {
		t.Fatalf("pod = %+v, err = %v", pod, err)
	}
	if err := s.Delete(ctx, "sim-session-practical-local"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get(ctx, "sim-session-practical-local"); !errors.Is(err, ErrPodGone) {
		t.Errorf("after delete: %v — a recycle would wait for this forever", err)
	}
}
