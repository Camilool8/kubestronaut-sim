// Command conductor is the privileged control-plane sidecar: the only
// container holding the Docker socket. It executes environment
// operations (reset, bank switch) that the exam UI requests through the
// facilitator's /api/control proxy. It listens only on the internal
// control network — no host port, no exam-network presence.
package main

import (
	"log"
	"net/http"
	"os"
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

func main() {
	listen := envOr("LISTEN", ":9000")
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

	srv := &http.Server{
		Addr:              listen,
		Handler:           api.New(ctrl, store),
		ReadHeaderTimeout: readHeaderTimeout,
	}
	log.Printf("conductor listening on %s (project %s, engine %s)", listen, project, engineName)
	log.Fatal(srv.ListenAndServe())
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
