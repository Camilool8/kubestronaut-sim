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

func listen(addr string) (net.Listener, error) {
	path, ok := strings.CutPrefix(addr, unixPrefix)
	if !ok {
		return net.Listen("tcp", addr)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}

	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	ln, err := net.Listen("unix", path)
	if err != nil {
		return nil, err
	}

	if err := os.Chmod(path, 0o600); err != nil {
		ln.Close()
		return nil, err
	}
	return ln, nil
}

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
