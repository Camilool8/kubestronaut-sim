// Command conductor is the privileged control-plane sidecar: the only
// container holding the Docker socket. It executes environment
// operations (reset, bank switch) that the exam UI requests through the
// facilitator's /api/control proxy. It listens only on the internal
// control network — no host port, no exam-network presence.
package main

import (
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"kubestronaut-sim/conductor/internal/api"
	"kubestronaut-sim/conductor/internal/catalog"
	"kubestronaut-sim/conductor/internal/control"
	"kubestronaut-sim/conductor/internal/docker"
	"kubestronaut-sim/conductor/internal/job"
	"kubestronaut-sim/conductor/internal/sshexec"
)

const readHeaderTimeout = 10 * time.Second

// unixPrefix marks a LISTEN value as a filesystem socket rather than a
// TCP address.
const unixPrefix = "unix:"

func main() {
	listenAddr := envOr("LISTEN", ":9000")
	engine, engineName := newEngine()
	project := envOr("COMPOSE_PROJECT", "kubestronaut-sim")
	facilitatorURL := envOr("FACILITATOR_URL", "http://facilitator:8080")
	instances := strings.Split(envOr("INSTANCES", "instance-1,instance-2"), ",")

	catalogDir := envOr("CATALOG_DIR", "/run/banks")
	cat, err := catalog.Load(catalogDir)
	if err != nil {
		log.Fatalf("conductor: load catalog from %s: %v", catalogDir, err)
	}

	store := job.NewStore(time.Now)
	ctrl := &control.Controller{
		Engine:         engine,
		Store:          store,
		Project:        project,
		FacilitatorURL: facilitatorURL,
		Instances:      instances,
		// Set to "" to skip; a bank with no image-building questions never
		// writes to the registry, but wiping it costs nothing either way.
		Registry:       envOr("REGISTRY_SERVICE", "registry"),
		HTTPClient:     &http.Client{Timeout: 15 * time.Second},
		VerifyBudget:   90 * time.Second,
		VerifyInterval: 2 * time.Second,
		Catalog:        cat,
		BankFile:       envOr("BANK_FILE", "/shared/bank"),
		RestartExtra:   strings.Split(envOr("RESTART_EXTRA", "docs-proxy,facilitator"), ","),
	}

	ln, err := listen(listenAddr)
	if err != nil {
		log.Fatalf("conductor: listen on %s: %v", listenAddr, err)
	}
	srv := &http.Server{
		Handler:           api.New(ctrl, store),
		ReadHeaderTimeout: readHeaderTimeout,
	}
	log.Printf("conductor listening on %s (project %s, engine %s)", listenAddr, project, engineName)
	log.Fatal(srv.Serve(ln))
}

// listen opens the control API's listener.
//
// A TCP address is what compose runs, where `controlnet: internal:
// true` puts the conductor on a network the candidate's containers are
// not on. A hosted session has no such thing: the whole stack is one
// Pod, one network namespace, and `127.0.0.1:9000` from the candidate's
// own shell would reach the API that resets their cluster. A unix
// socket is the boundary that survives sharing a namespace — it is
// reachable only from a container that mounts the volume holding it,
// which is the facilitator and nothing else.
func listen(addr string) (net.Listener, error) {
	path, ok := strings.CutPrefix(addr, unixPrefix)
	if !ok {
		return net.Listen("tcp", addr)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	// A socket file outlives the process that made it, and net.Listen
	// refuses to bind over one. Removing it is safe because exactly one
	// conductor exists per stack; leaving it would make every restart
	// fail with "address already in use" against a file nothing is
	// listening on.
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	ln, err := net.Listen("unix", path)
	if err != nil {
		return nil, err
	}
	// The mount is the boundary; the mode is a second lock on it. Both
	// containers run as root today, so 0600 costs nothing.
	if err := os.Chmod(path, 0o600); err != nil {
		ln.Close()
		return nil, err
	}
	return ln, nil
}

// newEngine picks how the conductor reaches the other containers.
//
// docker is the default and is what compose runs: the socket is mounted,
// and services are found by the labels compose stamps on them. ssh is for
// the hosted deployment, where the whole stack is one Kubernetes Pod —
// there is no socket to mount and no container to look up, so the same
// calls go over ssh to the service's hostname.
//
// An unrecognised value is fatal rather than a silent fall back to
// docker: getting this wrong means every control operation fails at the
// first exec, minutes into a job, instead of at startup.
func newEngine() (control.Engine, string) {
	switch name := strings.ToLower(envOr("ENGINE", "docker")); name {
	case "docker":
		return docker.New(envOr("DOCKER_SOCKET", "/var/run/docker.sock")), name
	case "ssh":
		return sshexec.New(
			envOr("SSH_KEY", "/shared/ssh/id_ed25519"),
			envOr("SSH_USER", "root"),
		), name
	default:
		log.Fatalf("conductor: unknown ENGINE %q (want docker or ssh)", name)
		return nil, ""
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
