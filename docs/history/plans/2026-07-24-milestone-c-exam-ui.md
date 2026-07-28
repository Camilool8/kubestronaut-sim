# Milestone C — Facilitator, evaluator, exam UI: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** killer.sh-style exam at `http://localhost:8080`: Go facilitator (session/timer REST API + embedded React UI + same-origin noVNC reverse proxy with session lock) and a Go evaluator replacing `grade.sh` while keeping the `RESULT <earned> <total> <pct>` contract.

**Architecture:** New Go module `facilitator/` (`cmd/facilitator` + `internal/{exam,session,evaluate,desktop,api,web}`) and React app `ui/` embedded via `go:embed`. New compose service `facilitator` on `examnet`, publishing `127.0.0.1:8080`; desktop's `6080` publish removed. Design: `docs/superpowers/specs/2026-07-24-milestone-c-facilitator-design.md` (authoritative for API shapes and decisions).

**Tech Stack:** Go 1.24 (stdlib only), Vite + React 18 + TypeScript (`react-markdown` only runtime addition), node:22-alpine / golang:1.24-alpine / alpine:3.21 images.

## Global Constraints

- No host toolchains: Go via `docker run --rm -v "$PWD/facilitator":/w -w /w golang:1.24 go <cmd>`; node via `docker run --rm -v "$PWD/ui":/w -w /w node:22-alpine sh -c "<cmd>"`.
- Facilitator `go.mod` has **zero dependencies** (stdlib only). UI runtime deps: only `react`, `react-dom`, `react-markdown`.
- The Go binary never reads YAML: entrypoint converts `exam.yaml` → JSON (`yq -o=json`), binary reads it via `EXAM_JSON` path env. Validate-script `# points:`/`# desc:` headers are parsed in Go.
- Evaluator output contract is **byte-compatible** with `images/k8s-env/grade.sh` (scoreboard lines, `=== Score: e/t (p%) ===`, `RESULT e t p`, always exit 0, pct = integer floor, total 0 ⇒ pct 0). `tests/smoke.sh` parses `^RESULT `.
- ssh invocation copies grade.sh exactly: `-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o BatchMode=yes -o ConnectTimeout=10 -i /shared/ssh/id_ed25519 root@<instance> "KUBECONFIG=/home/candidate/.kube/config bash /banks/<bank>/<qid>/validate.d/<script>"`; per-check 30s context timeout ⇒ FAIL "check timed out".
- Session env config: `EXAM_JSON`, `BANK_DIR`, `SESSION_FILE` (default `/session/session.json`), `LISTEN` (default `:8080`), `DESKTOP_ADDR` (default `desktop:6080`), `SSH_KEY` (default `/shared/ssh/id_ed25519`), `SESSION_DURATION_OVERRIDE` (test-only, `time.ParseDuration`).
- Ports bind `127.0.0.1` only. Desktop's host port publish is removed in Task 7 (not before — smoke must never be red on `main`).
- Solutions endpoint 403 until session ended. Desktop proxy 403 unless running.
- Work on branch `feat/milestone-c-exam-ui` off `main`.

---

### Task 0: Branch

- [x] **Step 1:** `git checkout -b feat/milestone-c-exam-ui main` (done; spec + this plan are its first commits)

---

### Task 1: Facilitator scaffold + exam loader (Go, TDD)

**Files:**
- Create: `facilitator/go.mod` (`module kubestronaut-sim/facilitator`, `go 1.24`)
- Create: `facilitator/internal/exam/exam.go`
- Test: `facilitator/internal/exam/exam_test.go`
- Test fixtures: `facilitator/internal/exam/testdata/exam.json` (mirror of `banks/ckad-mock-01/exam.yaml` as `yq -o=json` would emit), `facilitator/internal/exam/testdata/bank/q01/validate.d/{10_ok.sh,20_bad-points.sh}`, `.../q02/validate.d/10_two.sh`

**Interfaces (Tasks 3/5 import these):**

```go
func Load(examJSONPath, bankDir string) (*Exam, error)

type Exam struct {
    Name, Title       string
    Duration          time.Duration // parsed from spec.duration ("120m")
    PassingScore      int
    KubernetesVersion string
    Questions         []Question    // exam.yaml order
}
type Question struct {
    ID, Instance, Domain string
    Weight               int
    Checks               []Check // lexical order of validate.d/*.sh
}
type Check struct {
    Name, Desc string // Name = script basename
    Points     int
    Skip       bool   // bad/missing "# points:" header
}
```

- [ ] **Step 1:** module + failing test: duration `"120m"` → `2*time.Hour`; questions in file order; checks lexical; `# points: 3`/`# desc: x` parsed; `# points: 08` and missing header ⇒ `Skip=true, Points=0`; desc containing colons preserved verbatim; unknown exam JSON path ⇒ error.
- [ ] **Step 2:** run `docker run --rm -v "$PWD/facilitator":/w -w /w golang:1.24 go test ./...` — expect FAIL (undefined symbols).
- [ ] **Step 3:** implement. Header parse: line scan for prefixes `# points: ` / `# desc: ` (first hit wins, mirroring grade.sh's `head -1`); points via `strconv.Atoi` **plus** reject leading zeros / negatives (regex-free check: `p != "0" && strings.HasPrefix(p, "0")` ⇒ skip) — retires the octal follow-up.
- [ ] **Step 4:** `go test ./...` PASS, `go vet ./...` clean.
- [ ] **Step 5:** Commit: `feat(facilitator): module scaffold + exam/bank loader`

---

### Task 2: Session store + state machine (Go, TDD)

**Files:**
- Create: `facilitator/internal/session/session.go`
- Test: `facilitator/internal/session/session_test.go`

**Interfaces (Task 5 imports):**

```go
func New(path string, dur time.Duration, clock func() time.Time, onExpire func()) (*Manager, error)
// Loads existing file (running session past expiry ⇒ ends immediately as
// "expired"; running with time left ⇒ timer re-armed for the remainder).
// Corrupt/missing file ⇒ idle. onExpire fires (once) when the timer ends
// the session; the API layer uses it to kick grading.

var ErrConflict = errors.New(...) // wrong-state transitions; API maps to 409

func (m *Manager) Start() (Snapshot, error)        // idle→running
func (m *Manager) End(reason string) error         // running→ended; ended-without-results ⇒ allowed (re-grade); else ErrConflict
func (m *Manager) Reset() error                    // any → idle
func (m *Manager) Snapshot() Snapshot              // lazy-expires running past 0:00 (fires onExpire)
func (m *Manager) SetResults(r json.RawMessage) error
func (m *Manager) SetGradeError(msg string) error
func (m *Manager) Results() (json.RawMessage, string, bool) // results, gradeError, graded?

type Snapshot struct {
    State            string // "idle" | "running" | "ended"
    StartedAt        time.Time
    DurationSeconds  int
    RemainingSeconds int    // 0 when not running
    EndReason        string // "" | "submitted" | "expired"
}
```

Persisted JSON: `{version:1, state, startedAt, durationSeconds, endedAt, endReason, results, gradeError}`; writes atomic (`os.CreateTemp` in same dir + `os.Rename`). All methods mutex-guarded (timer + HTTP goroutines).

- [ ] **Step 1:** failing table tests with fake clock (`var now time.Time; clock = func() time.Time { return now }`): idle→Start ok; double Start ⇒ ErrConflict; Snapshot remaining = duration − elapsed; advancing clock past expiry ⇒ Snapshot flips to ended/expired and onExpire fired once; End(submitted) from running; End on ended-with-results ⇒ ErrConflict; End on ended-without-results ⇒ ok; Reset from every state ⇒ idle; persistence round-trip (new Manager on same path sees state); reload of running-past-expiry ends immediately; corrupt file ⇒ idle; SetResults/SetGradeError persist.
- [ ] **Step 2:** verify FAIL; **Step 3:** implement; **Step 4:** test + vet PASS.
- [ ] **Step 5:** Commit: `feat(facilitator): session store and state machine with clock injection`

---

### Task 3: Evaluator (Go, TDD)

**Files:**
- Create: `facilitator/internal/evaluate/evaluate.go`
- Test: `facilitator/internal/evaluate/evaluate_test.go`

**Interfaces (Task 5 imports):**

```go
type Runner interface {
    // cmd is the full remote command string; ok=false ⇒ check failed (non-zero exit)
    Run(ctx context.Context, instance, cmd string) (out string, ok bool, err error)
}
func NewSSHRunner(keyPath string) Runner // os/exec ssh, grade.sh flag parity

func Grade(ex *exam.Exam, bank string, r Runner, checkTimeout time.Duration) *Results

type Results struct { // json tags match the spec's results schema
    Bank string; GradedAt time.Time
    Earned, Total, Percent, PassingScore int
    Passed bool
    Questions []QuestionResult // {ID,Instance,Domain,Earned,Total,Checks:[{Name,Desc,Points,Earned,Passed,Message}]}
}
func (r *Results) Scoreboard() string // grade.sh byte-parity (see Global Constraints)
```

- [ ] **Step 1:** failing tests with fake Runner: all-pass full score; all-fail zero; partial; SKIP checks excluded from total and printed as `  [SKIP] <name>: bad '# points:' header`; Runner ctx deadline exceeded ⇒ FAIL with message `check timed out`; output trimmed of trailing newline (grade.sh `$(...)` behavior); Scoreboard golden test against a literal expected string copied from a real grade.sh run shape, incl. blank lines and `RESULT e t p`; pct floor (5/17 ⇒ 29); total 0 ⇒ `RESULT 0 0 0`; Passed = pct ≥ PassingScore.
- [ ] **Step 2:** FAIL; **Step 3:** implement (`exec.CommandContext(ctx, "ssh", args...)`, `CombinedOutput`); **Step 4:** test + vet PASS.
- [ ] **Step 5:** Commit: `feat(facilitator): evaluator with grade.sh-parity scoreboard and RESULT contract`

---

### Task 4: Desktop reverse proxy + session lock (Go, TDD)

**Files:**
- Create: `facilitator/internal/desktop/proxy.go`
- Test: `facilitator/internal/desktop/proxy_test.go`

**Interfaces (Task 5 imports):**

```go
// unlocked reports whether the desktop may be used (session running).
func New(target string /* host:port */, unlocked func() bool) http.Handler
// Mounted at /desktop/ by the API layer; handler receives the ORIGINAL
// path and strips the /desktop prefix itself. GET /desktop → 308 to /desktop/.
```

Implementation: `httputil.ReverseProxy{Rewrite: ..., FlushInterval: -1}`; locked ⇒ 403 (requests whose path ends in `.html` or equals `/desktop/` get a small dark HTML page; others plain text). Stdlib passes WebSocket upgrades through.

- [ ] **Step 1:** failing tests: httptest backend records paths — `/desktop/vnc.html` arrives as `/vnc.html`; query string preserved; locked ⇒ 403 and backend NOT hit; `/desktop` ⇒ 308 `/desktop/`; Upgrade passthrough: fake backend hijacks, replies `101` + echoes bytes; client dials raw TCP through the proxy server, asserts 101 + echo while unlocked and 403 while locked.
- [ ] **Step 2:** FAIL; **Step 3:** implement; **Step 4:** test + vet PASS.
- [ ] **Step 5:** Commit: `feat(facilitator): same-origin noVNC reverse proxy with session lock`

---

### Task 5: HTTP API + main + grade subcommand (Go, TDD)

**Files:**
- Create: `facilitator/internal/api/api.go`
- Test: `facilitator/internal/api/api_test.go`
- Create: `facilitator/internal/web/web.go` + `facilitator/internal/web/dist/index.html` (placeholder: `<!doctype html><title>kubestronaut-sim</title><p>UI not built — use the Docker image.</p>`)
- Create: `facilitator/cmd/facilitator/main.go`

**Interfaces:**

```go
// internal/web
//go:embed all:dist
var Dist embed.FS
func FS() fs.FS // sub(Dist, "dist")

// internal/api
type Grader func() // kicks async grading; wired in main
func New(ex *exam.Exam, mgr *session.Manager, grade Grader, desktop http.Handler, ui fs.FS) http.Handler
```

Routes exactly per the spec table (§3), Go 1.24 ServeMux patterns (`GET /api/questions/{id}`, `POST /api/session/start`, …). SPA fallback: unknown non-`/api`, non-`/desktop` paths serve `index.html`. `POST /api/session/end` and the expiry path both call the injected `Grader` after `End()` succeeds. `main.go`: env wiring per Global Constraints; `SESSION_DURATION_OVERRIDE` overrides `ex.Duration`; grader func = goroutine running `evaluate.Grade` then `SetResults`/`SetGradeError` (marshal `Results` to `json.RawMessage`); argv `grade` subcommand = load exam, run `evaluate.Grade` synchronously with the real ssh Runner, print `Scoreboard()`, exit 0 (no session involvement).

- [ ] **Step 1:** failing httptest tables: every route's happy path + error codes from the spec table; solutions 403 while idle AND running, 200 after End; `question.md`/`solution.md` markdown round-trips from a testdata bank dir; results lifecycle 409 (idle/running) → 202 (ended, grading) → 200 (SetResults) and 500 (SetGradeError); end 409 idle, 202 running, 202 re-grade on ended-without-results, 409 ended-with-results; DELETE resets to idle from any state; SPA fallback serves index.html for `/score`; `/api/exam` includes per-question `totalPoints` (sum of non-skip check points).
- [ ] **Step 2:** FAIL; **Step 3:** implement; **Step 4:** test + vet PASS (whole module).
- [ ] **Step 5:** Commit: `feat(facilitator): REST API, session lifecycle endpoints, grade subcommand`

---

### Task 6: React UI

**Files:**
- Create: `ui/package.json`, `ui/package-lock.json` (via dockerized `npm install`), `ui/tsconfig.json`, `ui/vite.config.ts`, `ui/index.html`, `ui/src/main.tsx`, `ui/src/App.tsx`, `ui/src/api.ts`, `ui/src/screens/Start.tsx`, `ui/src/screens/Exam.tsx`, `ui/src/screens/Score.tsx`, `ui/src/components/TimerBar.tsx`, `ui/src/components/QuestionPanel.tsx`, `ui/src/components/CheckList.tsx`, `ui/src/theme.css`
- Modify: `.gitignore` (+ `ui/node_modules/`, `ui/dist/`, and keep `facilitator/internal/web/dist/index.html` placeholder committed — do NOT ignore that path)

**Requirements:**
- `vite.config.ts`: `build.outDir` default `dist`; dev `server.proxy` for `/api` and `/desktop` → `http://localhost:8080` with `ws: true`.
- `api.ts`: typed client mirroring the spec's JSON shapes; single `getSession()` poller helper.
- `App.tsx`: screen = f(session state): idle→Start, running→Exam, ended→Score. Poll `/api/session` every 10 s (and on window focus); Exam ticks remaining locally at 1 Hz between polls.
- Exam screen iframe src **exactly**: `/desktop/vnc.html?autoconnect=true&resize=remote&reconnect=true&path=desktop/websockify`. Unmount iframe when state leaves `running`. End-exam button uses in-app confirm (no `window.confirm` — blocks automation).
- Score screen: percent, PASS/FAIL banner vs passingScore, per-question `<details>` check rows (✓/✗, desc, earned/points, message), lazy-fetch solution markdown per question when expanded; while results are 202, show "Grading…" and poll every 3 s.
- Timer display `H:MM:SS`, turns red under 5 minutes.
- Dark terminal-friendly theme (single `theme.css`, monospace accents, no CSS framework).

- [ ] **Step 1:** scaffold + implement all files.
- [ ] **Step 2:** verify: `docker run --rm -v "$PWD/ui":/w -w /w node:22-alpine sh -c "npm ci && npx tsc --noEmit && npm run build"` → `dist/` produced, zero type errors.
- [ ] **Step 3:** Commit: `feat(ui): killer.sh-style exam UI — start, exam, and score screens`

---

### Task 7: Image, compose, sim wiring

**Files:**
- Create: `facilitator/Dockerfile` (3-stage: `node:22-alpine` → `npm ci && npm run build` of `ui/`; `golang:1.24-alpine` → copy `facilitator/`, overlay `ui/dist` onto `internal/web/dist`, `CGO_ENABLED=0 go build ./cmd/facilitator`; `alpine:3.21` + `apk add --no-cache yq-go openssh-client` + binary + entrypoint)
- Create: `facilitator/entrypoint.sh` (`yq -o=json '.' "/banks/${BANK}/exam.yaml" > /tmp/exam.json`; `export EXAM_JSON=/tmp/exam.json BANK_DIR=/banks/${BANK}`; `exec /facilitator "$@"`)
- Create: `.dockerignore` (root: `.git`, `.superpowers`, `docs`, `images`, `banks`, `tests`, `ui/node_modules`, `ui/dist`, `proxy`)
- Modify: `docker-compose.yaml` — add `facilitator` service (build `{context: ., dockerfile: facilitator/Dockerfile}`, `127.0.0.1:8080:8080`, env `BANK`, volumes `./banks:/banks:ro`, `shared:/shared:ro`, `session:/session`, networks `[examnet]`, depends_on `k8s-env: service_healthy`, `desktop: service_healthy`, `ckad-1/ckad-2: service_started`, healthcheck busybox wget `--spider http://127.0.0.1:8080/healthz`, `restart: unless-stopped`); **remove `desktop.ports`**; add `session: {}` volume.
- Modify: `sim` — `up` message → `Exam UI: http://localhost:8080 — or ./sim ssh ckad-1`; `grade` → `docker compose exec facilitator /entrypoint.sh grade`; `reset` → after instance recreate, `curl -fsS -X DELETE http://localhost:8080/api/session >/dev/null || true`.
- Delete: `images/k8s-env/grade.sh`; remove its COPY/chmod in `images/k8s-env/Dockerfile`.

- [ ] **Step 1:** implement all files.
- [ ] **Step 2:** verify live:

```bash
./sim up
curl -fsS localhost:8080/healthz
curl -fsS localhost:8080/api/exam            # title + 3 questions + totalPoints
curl -s -o /dev/null -w '%{http_code}' localhost:8080/desktop/vnc.html   # 403
curl -fsS -X POST localhost:8080/api/session/start
curl -fsS -o /dev/null localhost:8080/desktop/vnc.html && echo DESKTOP-OK
./sim grade | grep '^RESULT '                # RESULT 0 17 0
curl -fsS -X DELETE localhost:8080/api/session -o /dev/null -w '%{http_code}'  # 204
```

- [ ] **Step 3:** Commit: `feat: wire facilitator into compose; ./sim grade via evaluator; single-port 8080`

---

### Task 8: Smoke extension + docs sync

**Files:**
- Modify: `tests/smoke.sh` — replace the `localhost:6080` noVNC assertion with facilitator equivalents; keep every existing `RESULT`-parsing assertion. Add, in lifecycle order: healthz 200; `/api/exam` title contains bank title; desktop 403 (idle); solution 403 (idle); `POST start` 200; remaining ≤ duration and strictly decreasing after `sleep 3`; desktop 200 (running); after solutions scripts + `POST end`: poll `/api/results` (2s interval, 60s budget) until 200; assert `earned==total` and `passed==true` (parse via `python3 -c`); solution 200 (ended); desktop 403 (ended); `DELETE` session → `GET /api/session` state `idle`. Auto-end block: `SESSION_DURATION_OVERRIDE=20s docker compose up -d facilitator` → start → sleep 25 → state `ended`/`expired` + desktop 403 → recreate facilitator without override.
- Modify: `README.md` — quickstart now `./sim up` → open `http://localhost:8080`; describe start→exam→score flow; note desktop/solutions gating is UX fidelity (files are local); keep `./sim ssh` dogfood path.
- Modify: `docs/bank-spec.md` — `duration`/`passingScore` now **enforced** by the facilitator; validate checks must finish within 30s; note the informational-fields caveat is retired.
- Modify: `docs/superpowers/specs/2026-07-21-kubestronaut-sim-mvp-design.md` — deviations note: JSON file not SQLite; evaluator in facilitator via ssh exec; desktop reachable only through `:8080` proxy.

- [ ] **Step 1:** implement; **Step 2:** full cold-start `./tests/smoke.sh` → `SMOKE PASS` (≈20 min).
- [ ] **Step 3:** Commit: `test: facilitator/session/desktop-lock smoke assertions; docs: single-port quickstart`

---

### Task 9: Follow-ups capture

**Files:**
- Modify: `docs/follow-ups.md` — strike/retire items fixed by C (points-guard octal, validate timeout, "duration/passingScore informational"); add Milestone C section: kill live WS tunnels on session end; vitest harness for UI utils; facilitator non-root USER + pinned base tags; results/attempt history; `SESSION_DURATION_OVERRIDE` is test-only; `DELETE /api/session` needs auth when hosted.

- [ ] **Step 1:** implement; **Step 2:** Commit: `docs: Milestone C follow-ups; retire items fixed by evaluator`

---

### Task 10: Finish branch

- [ ] Final whole-branch review; fix findings; fresh smoke evidence.
- [ ] Merge: `git checkout main && git merge --no-ff feat/milestone-c-exam-ui` — message: `Merge milestone-c: facilitator + evaluator + exam UI (single-origin :8080, session timer, desktop lock)`.
