# Milestone C — Facilitator, evaluator, exam UI (design)

Date: 2026-07-24. Follows the MVP design
(`2026-07-21-kubestronaut-sim-mvp-design.md`) §5–7; supersedes its
facilitator/evaluator sketches where they differ.

## Goal

Make the simulator usable like killer.sh: one URL, `http://localhost:8080`,
serving a React exam UI with a start screen, an exam view (countdown timer,
question panel, embedded noVNC desktop), and a score page. A Go
**facilitator** service owns the exam session (start / remaining time /
auto-end at 0:00) and reverse-proxies the desktop so the noVNC iframe is
same-origin and lockable. A Go **evaluator** replaces
`images/k8s-env/grade.sh`, keeping its `RESULT <earned> <total> <pct>`
machine contract. `spec.duration` and `spec.passingScore` become enforced
(they were informational since Milestone A).

## Decisions

- **New Go module `facilitator/`** (`module kubestronaut-sim/facilitator`,
  go 1.24, stdlib only), mirroring `proxy/` conventions:
  `cmd/facilitator/` + `internal/{exam,session,evaluate,api,desktop,web}`.
- **Same-origin desktop**: the facilitator reverse-proxies
  `desktop:6080` under `/desktop/` (WebSocket upgrade passes through
  stdlib `httputil.ReverseProxy`). The desktop's `127.0.0.1:6080` host
  publish is **removed** — keeping it would bypass the session lock. The
  facilitator returns 403 on `/desktop/*` unless a session is `running`.
- **Session state = one JSON file** at `/session/session.json` on a new
  named volume `session` (survives `./sim down`/`up`; wiped by
  `./sim purge`; cleared by `./sim reset` via `DELETE /api/session`).
  No SQLite. Atomic writes (temp file + rename).
- **Bank parsing stays out of Go**: the facilitator entrypoint converts
  `exam.yaml` to JSON with `yq -o=json` (image already needs `yq-go`); the
  binary reads env-pointed JSON with `encoding/json`. `# points:` /
  `# desc:` validate headers are parsed in Go (`strconv.Atoi` — no octal
  footgun, retiring that follow-up).
- **Evaluator shells out to the `ssh` binary** (openssh-client in the
  image) with exactly `grade.sh`'s flags and remote command — behavioral
  parity with the proven grader, zero Go dependencies (`x/crypto/ssh`
  avoided). Each check runs under a 30s context timeout (retiring the
  hung-check follow-up). `grade.sh` is deleted; `./sim grade` execs the
  facilitator's session-free `grade` subcommand, which prints the identical
  scoreboard, `=== Score: e/t (p%) ===` and `RESULT e t p` lines, exit 0.
- **Timer correctness over cleverness**: remaining time is always derived
  from persisted `startedAt + duration − now` (never a decremented
  counter). A server-side `time.Timer` auto-ends at 0:00 and is re-armed
  from disk on process boot; every state read also lazily expires as a
  backstop. Clock is injected for tests. `SESSION_DURATION_OVERRIDE` env
  (test-only) overrides `spec.duration`.
- **End-then-grade**: ending a session (submit or expiry) persists state
  `ended` first — the desktop locks immediately — then grades
  asynchronously. Evaluator failure is persisted as `gradeError`;
  re-POSTing end on an ended session without results re-grades (recovery).
- **Solutions gated server-side**: `GET /api/questions/{id}/solution` is
  403 until the session has ended (killer.sh behavior). Documented as UX
  fidelity, not security — the bank files sit on the candidate's disk.
- **UI = Vite + React + TS** in top-level `ui/`; runtime deps only
  `react`, `react-dom`, `react-markdown` (client-side rendering of
  question/solution markdown). No router: the visible screen is a function
  of session state. One dark, terminal-friendly stylesheet. Built assets
  are `go:embed`ded from `facilitator/internal/web/dist` (a committed
  placeholder `index.html` keeps `go test` green without node); the
  facilitator image is a 3-stage build (node → go → alpine).

## Components

### 1. Session state machine (`internal/session`)

States: `idle → running → ended`, with `endReason ∈ {submitted, expired}`.

Persisted shape (`/session/session.json`):

```json
{
  "version": 1,
  "bank": "ckad-mock-01",
  "state": "running",
  "startedAt": "2026-07-24T12:00:00Z",
  "durationSeconds": 7200,
  "endedAt": null,
  "endReason": "",
  "results": null,
  "gradeError": ""
}
```

- `Start()`: idle→running, records `startedAt`, arms expiry timer. Error
  if not idle.
- `End(reason)`: running→ended (also allowed on ended-without-results for
  re-grade). Persists before grading starts.
- `Reset()`: any state → idle (file reset), cancels timer.
- `Snapshot()`: state + remainingSeconds (lazy-expires if past 0:00).
- On boot, a persisted `running` session re-arms the timer from
  `startedAt`; if already past expiry it ends immediately as `expired`.

### 2. Evaluator (`internal/evaluate`)

- `Runner` interface (`Run(ctx, instance, cmd) (out string, ok bool, err
  error)`); production impl = `os/exec` ssh:
  `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null
  -o LogLevel=ERROR -o BatchMode=yes -o ConnectTimeout=10
  -i /shared/ssh/id_ed25519 root@<instance>
  "KUBECONFIG=/home/candidate/.kube/config bash /banks/<bank>/<qid>/validate.d/<script>"`.
- `Grade(exam, runner)` walks questions/checks in lexical order, 30s
  timeout per check (timeout ⇒ FAIL, message "check timed out"). Checks
  with bad/missing `# points:` are `[SKIP]` and excluded from totals
  (grade.sh parity).
- `Results.Scoreboard()` reproduces grade.sh's exact output: header
  `=== <bank> results ===`, per question `-- qNN (on <instance>)`,
  `  [PASS] <desc> (<pts> pts) — <msg>` / `  [FAIL] <desc> (0/<pts> pts) —
  <msg>` / `  [SKIP] <basename>: bad '# points:' header`, then
  `=== Score: e/t (p%) ===` and `RESULT e t p`. `pct` = integer floor
  `earned*100/total` (0 when total is 0).

### 3. HTTP API (`internal/api`)

JSON everywhere; errors `{"error":"..."}`.

| Endpoint | Behavior |
|---|---|
| `GET /healthz` | 200 `ok` (used by compose healthcheck) |
| `GET /api/exam` | `{name,title,durationSeconds,passingScore,kubernetesVersion,questions:[{id,instance,domain,weight,totalPoints}]}` |
| `GET /api/questions/{id}` | `{id,instance,domain,markdown}` (raw question.md); 404 unknown |
| `GET /api/questions/{id}/solution` | 403 unless ended; then `{id,markdown}` |
| `POST /api/session/start` | idle→running, 200 session snapshot; 409 otherwise |
| `GET /api/session` | `{state,startedAt,durationSeconds,remainingSeconds,endReason}` |
| `POST /api/session/end` | running→ended(submitted), async grade, 202; regrade if ended w/o results; 409 if idle |
| `GET /api/results` | 409 not ended; 202 `{"state":"grading"}`; 500 `{"error":...}` on gradeError; 200 results |
| `DELETE /api/session` | reset to idle, 204 (used by `./sim reset`; localhost single-user, unauthenticated by design) |
| `/desktop/*` | reverse proxy to `desktop:6080`; 403 unless running |
| `/` + assets | embedded React SPA (fallback to index.html) |

Results JSON:

```json
{
  "bank": "ckad-mock-01", "gradedAt": "…",
  "earned": 17, "total": 17, "percent": 100,
  "passingScore": 66, "passed": true,
  "questions": [
    {"id": "q01", "instance": "ckad-1", "domain": "…", "earned": 6, "total": 6,
     "checks": [{"name": "10_list-file.sh", "desc": "…", "points": 2,
                 "earned": 2, "passed": true, "message": "…"}]}]
}
```

### 4. Desktop proxy (`internal/desktop`)

`httputil.ReverseProxy` with `Rewrite` → `http://desktop:6080`,
`FlushInterval: -1`, mounted at `/desktop/` (prefix stripped; `/desktop` →
`/desktop/` redirect). The UI iframe uses
`/desktop/vnc.html?autoconnect=true&resize=remote&reconnect=true&path=desktop/websockify`
so noVNC's WebSocket also flows through the proxy. When session ≠ running:
page requests get a small dark 403 HTML ("Desktop locked"), other requests
plain 403. Known limit (follow-up): a WS tunnel established while running
survives into `ended`; the UI unmounts the iframe on state change, and any
reconnect is refused.

### 5. UI (`ui/`)

- **Start screen**: exam title, duration, passing score, question count,
  environment tips (from `/api/exam`), Start button.
- **Exam view**: top bar with countdown (local 1 Hz tick, resync from
  `GET /api/session` every 10 s) and End-exam button (confirm dialog);
  collapsible left panel with question list + `react-markdown` rendering
  of the selected question; main area = noVNC iframe.
- **Score page**: big percent + PASS/FAIL vs `passingScore`; per-question
  `<details>` with per-check rows (desc, points, message); lazy-loaded
  solution markdown; "grading…" state while `/api/results` returns 202.

### 6. Compose / `sim` changes

- New service `facilitator`: build context repo root (spans `ui/` +
  `facilitator/`), `127.0.0.1:8080:8080`, networks `[examnet]` only
  (reaches desktop + instances; published port works — desktop proved it),
  volumes `./banks:/banks:ro`, `shared:/shared:ro`, `session:/session`;
  depends_on k8s-env healthy, desktop healthy, ckad-1/2 started;
  healthcheck `wget -q --spider http://127.0.0.1:8080/healthz` (busybox
  wget — alpine has no curl); `restart: unless-stopped`.
- `desktop`: remove `ports:` (healthcheck is container-internal, unaffected).
- New volume `session: {}`.
- `./sim up` prints `Exam UI: http://localhost:8080`; `./sim grade` →
  `docker compose exec facilitator /entrypoint.sh grade` (compose exec
  skips the image entrypoint, and the yq→JSON setup lives there);
  `./sim reset` additionally calls `DELETE /api/session`.

## Error handling

- Malformed/missing exam JSON, bank dir, or ssh key ⇒ facilitator exits
  non-zero at boot with a clear message; compose restart policy applies.
- Evaluator failures (ssh unreachable, all-checks errors) never crash the
  facilitator: persisted as `gradeError`, surfaced via `/api/results` 500,
  recoverable by re-POSTing end.
- Session file corruption ⇒ boot treats it as idle after logging (file is
  regenerated on next start); version field allows future migration.
- API misuse (double start, results before end) ⇒ 409 with JSON error.

## Testing / verification

- Go unit tests (dockerized `go test ./...`): exam loader (fixtures incl.
  bad points header), session machine (fake clock: transitions, 409s, lazy
  expiry, persistence round-trip, boot re-arm past expiry), evaluator
  (fake Runner: full/zero/partial, SKIP, timeout, golden scoreboard),
  API (httptest tables incl. solutions gating and results 409/202/500/200),
  desktop proxy (prefix strip, lock, Upgrade passthrough via hijacking
  fake backend).
- UI: `tsc --noEmit` + `vite build` in dockerized node; no unit harness
  this milestone (follow-up: vitest for timer/format utils).
- Smoke additions: healthz; `/api/exam` title; desktop 403 before start
  and after end; solution 403 before end, 200 after; remaining decreases;
  end → poll `/api/results` to 200, assert earned==total && passed;
  `./sim reset` → idle; auto-end e2e with `SESSION_DURATION_OVERRIDE=20s`;
  all existing `RESULT`-based lifecycle assertions unchanged.

## Out of scope (later milestones / follow-ups)

- Milestone B hardening follow-ups (stay deferred to D).
- CI, GHCR publishing, amd64 verification (Milestone D).
- Multi-session, attempt history, auth/TLS, hosted provisioning.
- Killing established VNC WebSockets at session end (follow-up).
- UI unit-test harness (follow-up).
