// Command facilitator serves the exam session HTTP API (and, in its
// `grade` argv form, a read-only scoring run). docs/api.md is the
// current reference; the original design is frozen at
// docs/history/specs/2026-07-24-milestone-c-facilitator-design.md.
package main

import (
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"os"
	"sync/atomic"
	"time"

	"kubestronaut-sim/facilitator/internal/api"
	"kubestronaut-sim/facilitator/internal/bootstate"
	"kubestronaut-sim/facilitator/internal/desktop"
	"kubestronaut-sim/facilitator/internal/evaluate"
	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/history"
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

// runGrade implements the `facilitator grade` subcommand: load the exam,
// grade it synchronously over the real ssh Runner, print the
// grade.sh-parity scoreboard to stdout, done. No HTTP server, and no
// session state is written — this only ever reads.
//
// An mcq exam has no cluster to inspect — the only answer sheet is the
// live session's stored selections, and scoring those is the running
// server's job. Refusing beats grading an empty answer map and printing
// a misleading 0%.
func runGrade() error {
	cfg := loadExamConfig()

	ex, err := exam.Load(cfg.examJSON, cfg.bankDir)
	if err != nil {
		return fmt.Errorf("load exam: %w", err)
	}
	if ex.Type == exam.TypeMCQ {
		return fmt.Errorf("%s is a multiple-choice bank; answers live in the session, so grade it from the UI or POST /api/session/end (see docs/cli.md)", ex.Name)
	}

	runner := evaluate.NewSSHRunner(cfg.sshKey)
	res := evaluate.Grade(ex, ex.Name, runner, checkTimeout, gradeScope(ex))
	fmt.Print(res.Scoreboard())
	return nil
}

// gradeScope returns the question ids `facilitator grade` should score,
// or nil for "the whole bank" — which is what evaluate.Grade reads an
// empty list as, and what every unpooled bank gets.
//
// This subcommand used to be session-free on principle, and for an
// unpooled bank the principle and the answer agree: every question in
// the bank is seeded at boot, so scoring all of them IS scoring the
// exam. A POOLED bank breaks that. Only the drawn subset is ever seeded,
// so the questions left out cannot pass and cannot be made to — and
// grading the pool anyway prints a confident, wrong number: a perfect
// CKAD attempt scored 191/217 (88%) rather than 100%, on a cluster where
// every task the candidate was actually set had been done correctly.
//
// So the scope comes from the attempt when there is one. Best-effort in
// every direction, because this is a scoreboard and not the grader of
// record: an unreadable session file, an idle session, or a bank that
// does not pool all fall back to the whole bank, which is the behaviour
// this command has always had.
func gradeScope(ex *exam.Exam) []string {
	if !exam.Pooled(ex) {
		return nil
	}
	ids, err := session.DrawnIDs(envOr("SESSION_FILE", "/session/session.json"))
	if err != nil {
		fmt.Fprintf(os.Stderr,
			"grade: %s draws %d of its %d questions per attempt, and this attempt could not be read (%v);\n"+
				"       scoring the whole bank instead, so questions no attempt drew will score 0\n",
			ex.Name, ex.ExamLength, len(ex.Questions), err)
		return nil
	}
	if len(ids) == 0 {
		fmt.Fprintf(os.Stderr,
			"grade: %s draws %d of its %d questions per attempt and no attempt is open,\n"+
				"       so no question has been seeded; scoring the whole bank against an\n"+
				"       environment that holds none of it\n",
			ex.Name, ex.ExamLength, len(ex.Questions))
		return nil
	}
	return ids
}

// runServer wires every package into the long-running facilitator HTTP
// service: loads the exam, resumes (or starts) the session file, arms
// the async grader, performs the boot-time crash-recovery grading kick,
// and serves until ListenAndServe returns.
func runServer() error {
	cfg := loadExamConfig()
	sessionFile := envOr("SESSION_FILE", "/session/session.json")
	// A SEPARATE volume from the session file's, deliberately. The two
	// have opposite durability requirements: /session is scratch that
	// `./sim purge` is meant to take with it, while /state holds every
	// attempt the candidate has ever graded and must survive purge, a
	// reset, and a bank switch. Mounting them together would mean one
	// `docker compose down -v` erased both.
	historyFile := envOr("HISTORY_FILE", "/state/history.json")
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

	// No exam is a legitimate state, not a failure.
	//
	// An environment that has not been told which exam to be has no bank
	// to load, and the screen where the candidate chooses one is served by
	// this process — so refusing to start without one would mean the only
	// route to picking a bank required a bank to already be picked. The
	// entrypoint leaves EXAM_JSON empty in that case; `ex` stays nil, and
	// every handler that needs an exam answers 503 rather than assuming
	// one (see internal/api).
	//
	// A NAMED bank that will not load is still fatal. That is a broken
	// bank or a bad mount, and serving a catalog while silently ignoring
	// the exam someone explicitly asked for would hide it.
	var ex *exam.Exam
	var dur time.Duration
	if cfg.examJSON != "" {
		loaded, err := exam.Load(cfg.examJSON, cfg.bankDir)
		if err != nil {
			return fmt.Errorf("load exam: %w", err)
		}
		ex = loaded

		dur, err = resolveDuration(ex.Duration, durOverride)
		if err != nil {
			return fmt.Errorf("parse SESSION_DURATION_OVERRIDE: %w", err)
		}
		ex.Duration = dur
		// The override is a test knob ("end this attempt in 20s"), so it
		// has to reach every timed mode — a speed attempt still running
		// for an hour under SESSION_DURATION_OVERRIDE=20s would be a trap.
		// Training is deliberately untouched: it has no clock to override.
		if durOverride != "" {
			ex.SpeedDuration = dur
		}
	} else {
		log.Printf("no exam selected; serving the exam selector until one is chosen")
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
	// the natural fallback for direct/dev runs. With no exam loaded it is
	// empty, which is the right identity for a session manager that will
	// refuse to start anything: a persisted session belonging to a real
	// bank is then correctly not resumed into a bank-less process.
	activeBank := os.Getenv("ACTIVE_BANK")
	if activeBank == "" && ex != nil {
		activeBank = ex.Name
	}

	var onExpire atomic.Pointer[func()]
	mgr, err := session.New(sessionFile, activeBank, dur, time.Now, func() {
		if fn := onExpire.Load(); fn != nil {
			(*fn)()
		}
	})
	if err != nil {
		return fmt.Errorf("session: %w", err)
	}

	// history.Open never fails on a bad file: an unreadable or
	// wrong-version document is moved aside and reported, never removed.
	// The error it can still return is for something else going wrong
	// entirely, and even that must not stop an exam being sat — a
	// candidate who cannot see their past attempts is inconvenienced; one
	// who cannot start an attempt at all is stuck.
	hist, err := history.Open(historyFile)
	if err != nil {
		log.Printf("attempt history unavailable (%v); attempts will not be recorded", err)
		hist = nil
	}

	// Default-off, and the only thing in this process that knows a world
	// outside the Pod exists. Unset under compose, which is every local
	// run: no mirror, no request, no behaviour change.
	mir := newMirror(
		os.Getenv("HISTORY_WEBHOOK_URL"),
		os.Getenv("HISTORY_WEBHOOK_TOKEN"),
		cfg.bankDir,
		ex,
		log.Printf,
	)
	if mir != nil {
		log.Printf("attempts will also be posted to %s", os.Getenv("HISTORY_WEBHOOK_URL"))
	}

	runner := evaluate.NewSSHRunner(cfg.sshKey)
	g := newGrader(ex, mgr, runner, checkTimeout)
	g.record = func(token string, snap session.Snapshot, res *evaluate.Results) error {
		return recordAttempt(hist, mir, ex, token, snap, res)
	}
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
	// container — over the internal control network under compose, over
	// a unix socket in a hosted Pod. See conductorEndpoint.
	conductorURL, conductorTransport, err := conductorEndpoint(envOr("CONDUCTOR_ADDR", "conductor:9000"))
	if err != nil {
		return err
	}
	controlProxy := httputil.NewSingleHostReverseProxy(conductorURL)
	controlProxy.Transport = conductorTransport

	boot := bootstate.New(
		envOr("BOOT_FILE", "/shared/boot.json"),
		envOr("READY_MARKER", "/shared/ready"),
	)

	// WithBanks is a plain server-side GET of the conductor's bank list,
	// not the reverse proxy above: GET /api/catalog is answered HERE
	// because the conductor cannot see /state, and because looking at the
	// exam list must never be able to trigger a rebuild.
	// WithSeeder is the other server-side call to the conductor, and the
	// only one that starts work: a pooled hands-on bank boots with an
	// empty cluster on purpose, so the questions one attempt drew have to
	// be created before its clock may start. Wired unconditionally, like
	// the proxy above — whether it is USED is decided per bank by
	// exam.Pooled, and no bank in the tree opts in yet.
	handler := api.New(ex, cfg.bankDir, mgr, g.Grade, desktopHandler, controlProxy, web.FS(), boot, g.PracticeGrade,
		api.WithHistory(hist),
		api.WithBanks(newBanksFetcher(conductorURL, conductorTransport)),
		api.WithSeeder(newConductorSeeder(conductorURL, conductorTransport)),
	)

	srv := &http.Server{
		Addr:              listen,
		Handler:           handler,
		ReadHeaderTimeout: readHeaderTimeout,
	}
	log.Printf("facilitator listening on %s", listen)
	return srv.ListenAndServe()
}
