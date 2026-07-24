// Command facilitator serves the exam session HTTP API (and, in its
// `grade` argv form, a session-free scoring run) described in
// docs/superpowers/specs/2026-07-24-milestone-c-facilitator-design.md.
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"sync/atomic"
	"time"

	"kubestronaut-sim/facilitator/internal/api"
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

	// Fail fast at boot with a clear message rather than only
	// discovering a missing ssh key the first time a grade actually
	// runs (the `grade` subcommand doesn't need this check: it fails
	// the same way naturally, immediately, with no session involved).
	if err := checkSSHKey(cfg.sshKey); err != nil {
		return err
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

	handler := api.New(ex, cfg.bankDir, mgr, g.Grade, desktopHandler, web.FS())

	srv := &http.Server{
		Addr:              listen,
		Handler:           handler,
		ReadHeaderTimeout: readHeaderTimeout,
	}
	log.Printf("facilitator listening on %s", listen)
	return srv.ListenAndServe()
}
