// Command facilitator serves the exam session HTTP API (and, in its
// `grade` argv form, a session-free scoring run). docs/api.md is the
// current reference; the original design is frozen at
// docs/history/specs/2026-07-24-milestone-c-facilitator-design.md.
package main

import (
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"sync/atomic"
	"time"

	"kubestronaut-sim/facilitator/internal/api"
	"kubestronaut-sim/facilitator/internal/bootstate"
	"kubestronaut-sim/facilitator/internal/desktop"
	"kubestronaut-sim/facilitator/internal/evaluate"
	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/session"
	"kubestronaut-sim/facilitator/internal/web"
)

// checkTimeout is the per-check ssh deadline evaluate.Grade enforces,
// for both the server's async grader and the `grade` subcommand.
const checkTimeout = 30 * time.Second

// readHeaderTimeout bounds how long the HTTP server waits to read a
// request's headers, guarding against slow-loris-style connections.
const readHeaderTimeout = 10 * time.Second

func main() {
	if len(os.Args) > 1 && os.Args[1] == "grade" {
		if err := runGrade(); err != nil {
			fmt.Fprintln(os.Stderr, "grade:", err)
			os.Exit(1)
		}
		return
	}

	if err := runServer(); err != nil {
		log.Fatal(err)
	}
}

// examConfig is the env-derived configuration shared by both the
// server and the grade subcommand.
type examConfig struct {
	examJSON string
	bankDir  string
	sshKey   string
}

func loadExamConfig() examConfig {
	return examConfig{
		examJSON: envOr("EXAM_JSON", ""),
		bankDir:  envOr("BANK_DIR", ""),
		sshKey:   envOr("SSH_KEY", "/shared/ssh/id_ed25519"),
	}
}

// runGrade implements the session-free `facilitator grade` subcommand:
// load the exam, grade it synchronously over the real ssh Runner, print
// the grade.sh-parity scoreboard to stdout, done. No session file, no
// HTTP server.
func runGrade() error {
	cfg := loadExamConfig()

	ex, err := exam.Load(cfg.examJSON, cfg.bankDir)
	if err != nil {
		return fmt.Errorf("load exam: %w", err)
	}

	runner := evaluate.NewSSHRunner(cfg.sshKey)
	res := evaluate.Grade(ex, ex.Name, runner, checkTimeout)
	fmt.Print(res.Scoreboard())
	return nil
}

// runServer wires every package into the long-running facilitator HTTP
// service: loads the exam, resumes (or starts) the session file, arms
// the async grader, performs the boot-time crash-recovery grading kick,
// and serves until ListenAndServe returns.
func runServer() error {
	cfg := loadExamConfig()
	sessionFile := envOr("SESSION_FILE", "/session/session.json")
	listen := envOr("LISTEN", ":8080")
	desktopAddr := envOr("DESKTOP_ADDR", "desktop:6080")
	durOverride := os.Getenv("SESSION_DURATION_OVERRIDE")

	// Warn, do not fail. This used to return, which log.Fatal turned
	// into a restart loop — fine when the facilitator started only after
	// k8s-env was healthy, fatal now that it deliberately starts first:
	// the key is not written until bootstrap.sh generates it, so on a
	// cold boot this check is guaranteed to fail for minutes. Refusing
	// to run during that window is exactly the dead-browser problem the
	// early start exists to fix. The real protection moved to the boot
	// gate on POST /api/session/start, which refuses to begin an attempt
	// against an environment that is not ready — and by the time it *is*
	// ready, the key exists.
	if err := checkSSHKey(cfg.sshKey); err != nil {
		log.Printf("ssh key not usable yet (%v); grading will fail until the environment finishes starting", err)
	}

	ex, err := exam.Load(cfg.examJSON, cfg.bankDir)
	if err != nil {
		return fmt.Errorf("load exam: %w", err)
	}

	dur, err := resolveDuration(ex.Duration, durOverride)
	if err != nil {
		return fmt.Errorf("parse SESSION_DURATION_OVERRIDE: %w", err)
	}
	ex.Duration = dur
	// The override is a test knob ("end this attempt in 20s"), so it has
	// to reach every timed mode — a speed attempt still running for an
	// hour under SESSION_DURATION_OVERRIDE=20s would be a trap. Training
	// is deliberately untouched: it has no clock to override.
	if durOverride != "" {
		ex.SpeedDuration = dur
	}

	// onExpire must be wired into session.New before the grader that
	// actually implements it can be constructed, since the grader
	// needs the *session.Manager New itself returns. An atomic
	// indirection breaks that construction cycle: whatever expiry the
	// live process's real timer or a lazy Snapshot backstop observes
	// calls whatever *gradeFn currently points to, and is only ever
	// invoked after New returns (never synchronously from within it —
	// see session.New's doc comment on the load-time-expiry case).
	// The active bank id comes from the entrypoint (ACTIVE_BANK, derived
	// from /shared/bank); ex.Name matches it by bank convention and is
	// the natural fallback for direct/dev runs.
	activeBank := envOr("ACTIVE_BANK", ex.Name)

	var onExpire atomic.Pointer[func()]
	mgr, err := session.New(sessionFile, activeBank, dur, time.Now, func() {
		if fn := onExpire.Load(); fn != nil {
			(*fn)()
		}
	})
	if err != nil {
		return fmt.Errorf("session: %w", err)
	}

	runner := evaluate.NewSSHRunner(cfg.sshKey)
	g := newGrader(ex, mgr, runner, checkTimeout)
	gradeFn := g.Grade
	onExpire.Store(&gradeFn)

	// Crash recovery: see needsGradeRecovery's doc comment for exactly
	// which gap this closes (session.New's own load-time-expiry
	// correction not firing onExpire, or a prior process crashing
	// mid-grade).
	snap := mgr.Snapshot()
	_, gradeErr, graded := mgr.Results()
	if needsGradeRecovery(snap.State, graded, gradeErr) {
		g.Grade()
	}

	desktopHandler := desktop.New(desktopAddr, func() bool {
		return mgr.Snapshot().State == "running"
	})

	// Reverse proxy for the conductor's control API: the browser only
	// ever talks to :8080, and the conductor is only reachable from this
	// container (they share the internal control network).
	conductorURL, err := url.Parse("http://" + envOr("CONDUCTOR_ADDR", "conductor:9000"))
	if err != nil {
		return fmt.Errorf("parse CONDUCTOR_ADDR: %w", err)
	}
	controlProxy := httputil.NewSingleHostReverseProxy(conductorURL)

	boot := bootstate.New(
		envOr("BOOT_FILE", "/shared/boot.json"),
		envOr("READY_MARKER", "/shared/ready"),
	)

	handler := api.New(ex, cfg.bankDir, mgr, g.Grade, desktopHandler, controlProxy, web.FS(), boot, g.PracticeGrade)

	srv := &http.Server{
		Addr:              listen,
		Handler:           handler,
		ReadHeaderTimeout: readHeaderTimeout,
	}
	log.Printf("facilitator listening on %s", listen)
	return srv.ListenAndServe()
}
