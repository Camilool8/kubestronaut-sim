// Command sim-opener opens a documentation page as a tab in the exam
// desktop's Firefox.
//
// It exists because nothing else in the stack can reach the X display. The
// conductor drives containers over the Docker socket in compose and over ssh
// in a Pod, and the desktop offers neither; the facilitator can only speak
// HTTP to it. So the desktop carries its own listener.
//
// It is deliberately the smallest thing that works: one route, https only, and
// the URL handed to the browser as an argv element so there is no shell to
// quote for. The real allowlisting happens upstream — the facilitator only
// forwards a URL that the candidate's current question declared — and the
// browser itself still goes through the docs proxy.
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"time"
)

// runuser rather than su: it takes the command as argv, so a URL can never be
// read as shell. It lives in /usr/sbin, which is not always on PATH.
const runuser = "/usr/sbin/runuser"

const (
	browser = "firefox-esr"
	user    = "candidate"
	display = ":1"
)

// launchGrace bounds the wait for a launch that fails outright, which is the
// only thing waiting can tell us. Firefox exits within a second or so when it
// cannot reach the display or the profile is locked; a launch that works does
// not exit at all on the path that matters. With an instance already running,
// --new-tab hands the URL over the remote protocol and returns immediately;
// with none, this process becomes the browser and lives as long as the window.
//
// So the grace only has to outlast a fast failure, and it must stay the
// shortest of the three nested budgets — the UI gives a mutation 10s and the
// facilitator sits between. A cold start is the common case, and waiting one
// out answers the candidate with a timeout for a page that is opening in front
// of them.
const launchGrace = 3 * time.Second

type runner func(rawURL string) error

func main() {
	addr := envOr("OPENER_ADDR", ":6081")

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("ok"))
	})
	mux.Handle("POST /open", openHandler(openInBrowser))

	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("desktop opener listening on %s", addr)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("desktop opener: %v", err)
	}
}

func openHandler(run runner) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			URL string `json:"url"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
			http.Error(w, "body must be JSON: {\"url\":\"https://...\"}", http.StatusBadRequest)
			return
		}
		if !validURL(body.URL) {
			http.Error(w, "url must be an absolute https:// address", http.StatusBadRequest)
			return
		}
		if err := run(body.URL); err != nil {
			log.Printf("desktop opener: %v", err)
			http.Error(w, "could not reach the desktop browser", http.StatusBadGateway)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}

// validURL is a floor, not the allowlist. The facilitator has already matched
// this URL against the question's own links, and the docs proxy still governs
// what the browser may actually fetch.
func validURL(raw string) bool {
	if raw == "" || len(raw) > 2048 {
		return false
	}
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return u.Scheme == "https" && u.Host != ""
}

// openInBrowser hands the URL to Firefox's remote protocol. With an instance
// already running on this display and profile, --new-tab opens a tab in the
// window the candidate is looking at rather than a second window; with none
// running, it starts one.
func openInBrowser(rawURL string) error {
	cmd := exec.Command(runuser, "-u", user, "--", browser, "--new-tab", rawURL)
	cmd.Env = append(os.Environ(), "DISPLAY="+display)
	return launch(cmd, launchGrace)
}

// launch starts cmd and waits only long enough to catch a launch that fails
// outright. A process still running when the grace expires is the browser
// itself, so leaving it is the point; reaping it would close the window we
// just opened. The goroutine outlives this call to reap the child whenever it
// does exit.
func launch(cmd *exec.Cmd, grace time.Duration) error {
	if err := cmd.Start(); err != nil {
		return err
	}

	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()

	select {
	case err := <-done:
		return err
	case <-time.After(grace):
		return nil
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
