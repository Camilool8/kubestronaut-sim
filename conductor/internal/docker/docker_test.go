package docker

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func newFakeDaemon(t *testing.T, handler http.Handler) *Client {
	t.Helper()
	sock := filepath.Join(t.TempDir(), "docker.sock")
	ln, err := net.Listen("unix", sock)
	if err != nil {
		t.Fatalf("listen unix: %v", err)
	}
	srv := httptest.NewUnstartedServer(handler)
	srv.Listener = ln
	srv.Start()
	t.Cleanup(srv.Close)
	return New(sock)
}

func stdcopyFrame(stream byte, payload string) []byte {
	head := make([]byte, 8)
	head[0] = stream
	binary.BigEndian.PutUint32(head[4:], uint32(len(payload)))
	return append(head, payload...)
}

func TestFindContainerFiltersByComposeLabels(t *testing.T) {
	var gotFilters string
	c := newFakeDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/containers/json") {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		gotFilters = r.URL.Query().Get("filters")
		fmt.Fprint(w, `[{"Id":"abc123"}]`)
	}))

	id, err := c.FindContainer(context.Background(), "kubestronaut-sim", "instance-1")
	if err != nil {
		t.Fatalf("FindContainer: %v", err)
	}
	if id != "abc123" {
		t.Errorf("id = %q, want abc123", id)
	}

	var filters map[string][]string
	if err := json.Unmarshal([]byte(gotFilters), &filters); err != nil {
		t.Fatalf("filters not JSON: %v (%q)", err, gotFilters)
	}
	labels := strings.Join(filters["label"], ",")
	if !strings.Contains(labels, "com.docker.compose.project=kubestronaut-sim") ||
		!strings.Contains(labels, "com.docker.compose.service=instance-1") {
		t.Errorf("filters missing compose labels: %q", labels)
	}
}

func TestFindContainerErrorsWhenAbsent(t *testing.T) {
	c := newFakeDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[]`)
	}))
	if _, err := c.FindContainer(context.Background(), "p", "ghost"); err == nil {
		t.Fatal("want error for missing container")
	}
}

func TestExecRunsCommandAndReturnsExitAndOutput(t *testing.T) {
	var execBody struct {
		AttachStdout bool     `json:"AttachStdout"`
		AttachStderr bool     `json:"AttachStderr"`
		Cmd          []string `json:"Cmd"`
	}
	c := newFakeDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/containers/abc/exec"):
			if err := json.NewDecoder(r.Body).Decode(&execBody); err != nil {
				t.Errorf("decode exec create: %v", err)
			}
			fmt.Fprint(w, `{"Id":"e1"}`)
		case strings.HasSuffix(r.URL.Path, "/exec/e1/start"):
			w.Write(stdcopyFrame(1, "seeding q01\n"))
			w.Write(stdcopyFrame(2, "warning: slow\n"))
		case strings.HasSuffix(r.URL.Path, "/exec/e1/json"):
			fmt.Fprint(w, `{"ExitCode":3}`)
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
		}
	}))

	exit, out, err := c.Exec(context.Background(), "abc", []string{"bash", "-c", "true"}, nil)
	if err != nil {
		t.Fatalf("Exec: %v", err)
	}
	if exit != 3 {
		t.Errorf("exit = %d, want 3", exit)
	}
	if !strings.Contains(out, "seeding q01") || !strings.Contains(out, "warning: slow") {
		t.Errorf("output should carry both streams, got %q", out)
	}
	if !execBody.AttachStdout || !execBody.AttachStderr {
		t.Error("exec create must attach stdout+stderr")
	}
	if strings.Join(execBody.Cmd, " ") != "bash -c true" {
		t.Errorf("cmd = %v", execBody.Cmd)
	}
}

func TestExecStreamsCompleteLinesAsTheyArrive(t *testing.T) {
	release := make(chan struct{})
	c := newFakeDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/containers/abc/exec"):
			fmt.Fprint(w, `{"Id":"e1"}`)
		case strings.HasSuffix(r.URL.Path, "/exec/e1/start"):

			w.Write(stdcopyFrame(1, "Ensuring node image\nPreparing "))
			w.(http.Flusher).Flush()
			<-release
			w.Write(stdcopyFrame(1, "nodes\n"))
			w.Write(stdcopyFrame(2, "Installing CNI\ntrailing-no-newline"))
		case strings.HasSuffix(r.URL.Path, "/exec/e1/json"):
			fmt.Fprint(w, `{"ExitCode":0}`)
		}
	}))

	var mu sync.Mutex
	var lines []string
	done := make(chan struct{})
	go func() {
		defer close(done)
		_, _, err := c.Exec(context.Background(), "abc", []string{"x"}, func(line string) {
			mu.Lock()
			lines = append(lines, line)
			mu.Unlock()
		})
		if err != nil {
			t.Errorf("Exec: %v", err)
		}
	}()

	deadline := time.After(5 * time.Second)
	for {
		mu.Lock()
		got := len(lines)
		mu.Unlock()
		if got > 0 {
			break
		}
		select {
		case <-deadline:
			t.Fatal("no line delivered before the exec completed")
		case <-time.After(10 * time.Millisecond):
		}
	}
	close(release)
	<-done

	want := []string{"Ensuring node image", "Preparing nodes", "Installing CNI", "trailing-no-newline"}
	mu.Lock()
	defer mu.Unlock()
	if len(lines) != len(want) {
		t.Fatalf("lines = %q, want %q", lines, want)
	}
	for i := range want {
		if lines[i] != want[i] {
			t.Errorf("line %d = %q, want %q", i, lines[i], want[i])
		}
	}
}

func TestRestartHitsRestartEndpoint(t *testing.T) {
	var restarted string
	c := newFakeDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		restarted = r.URL.Path + "?" + r.URL.RawQuery
		w.WriteHeader(http.StatusNoContent)
	}))
	if err := c.Restart(context.Background(), "abc", 10); err != nil {
		t.Fatalf("Restart: %v", err)
	}
	if !strings.Contains(restarted, "/containers/abc/restart") || !strings.Contains(restarted, "t=10") {
		t.Errorf("restart request = %q", restarted)
	}
}

func TestErrorStatusSurfacesDaemonMessage(t *testing.T) {
	c := newFakeDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, `{"message":"broken daemon"}`)
	}))
	_, err := c.FindContainer(context.Background(), "p", "s")
	if err == nil || !strings.Contains(err.Error(), "broken daemon") {
		t.Fatalf("err = %v, want daemon message surfaced", err)
	}
}
