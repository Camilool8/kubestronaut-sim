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

const checkTimeout = 30 * time.Second

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

func runServer() error {
	cfg := loadExamConfig()
	sessionFile := envOr("SESSION_FILE", "/session/session.json")

	historyFile := envOr("HISTORY_FILE", "/state/history.json")
	listen := envOr("LISTEN", ":8080")
	desktopAddr := envOr("DESKTOP_ADDR", "desktop:6080")
	desktopControlAddr := envOr("DESKTOP_CONTROL_ADDR", "desktop:6081")
	durOverride := os.Getenv("SESSION_DURATION_OVERRIDE")

	if err := checkSSHKey(cfg.sshKey); err != nil {
		log.Printf("ssh key not usable yet (%v); grading will fail until the environment finishes starting", err)
	}

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

		if durOverride != "" {
			ex.SpeedDuration = dur
		}
	} else {
		log.Printf("no exam selected; serving the exam selector until one is chosen")
	}

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

	hist, err := history.Open(historyFile)
	if err != nil {
		log.Printf("attempt history unavailable (%v); attempts will not be recorded", err)
		hist = nil
	}

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

	snap := mgr.Snapshot()
	_, gradeErr, graded := mgr.Results()
	if needsGradeRecovery(snap.State, graded, gradeErr) {
		g.Grade()
	}

	desktopHandler := desktop.New(desktopAddr, func() bool {
		return mgr.Snapshot().State == "running"
	})

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

	handler := api.New(ex, cfg.bankDir, mgr, g.Grade, desktopHandler, controlProxy, web.FS(), boot, g.PracticeGrade,
		api.WithHistory(hist),
		api.WithBanks(newBanksFetcher(conductorURL, conductorTransport)),
		api.WithSeeder(newConductorSeeder(conductorURL, conductorTransport)),
		api.WithDocsOpener(api.NewHTTPDocsOpener(desktopControlAddr)),
	)

	srv := &http.Server{
		Addr:              listen,
		Handler:           handler,
		ReadHeaderTimeout: readHeaderTimeout,
	}
	log.Printf("facilitator listening on %s", listen)
	return srv.ListenAndServe()
}
