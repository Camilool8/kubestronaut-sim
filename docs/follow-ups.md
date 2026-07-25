# Follow-ups (from Milestone A reviews — none blocking)

Convert to GitHub issues once the repo has a remote.

## Grading strictness / bank content
- q01 `10_list-file.sh`: strip trailing whitespace on populated lines before diffing.
- q01 `30_quota.sh`: accept equivalent resource quantities (e.g. `1000m` == `1`) instead of canonical-string match. Highest-value fix in this list.
- ~~grader: tighten points guard to `(0|[1-9][0-9]*)` (leading-zero `08` currently hits bash octal parse)~~ (fixed in Milestone C: Go loader rejects leading zeros/negatives).
- ~~grader: wrap remote validate execution in `timeout` (connect-phase timeout exists; hung script still hangs grade). Add "checks must finish within N seconds" to bank-spec~~ (fixed in Milestone C: 30s per-check context timeout in evaluator).

## Images
- instance: regenerate ssh host keys in entrypoint (currently baked into the image layer, shared across deployments).
- instance: explicit `chmod 700` on `~/.ssh` dirs (currently relies on build umask).
- k8s-env: pin `yq-go` apk package explicitly (alpine `yq` alias ambiguity).
- k8s-env: trap bootstrap failure to log a clear error before container exit (downstream currently sees only healthcheck timeout).

## UX / docs
- `./sim grade` on a downed stack: friendly "run ./sim up first" message instead of raw compose error.
- smoke: add a `./sim ssh`-based assertion so the wrapper's ssh path is exercised.
- bank-spec: `kubernetesVersion` and `environment.nodes` remain informational (duration/passingScore enforced by Milestone C evaluator).
- README: mention `k8s-env` runs privileged (DinD requirement).
- Cross-arch: amd64 build/run path never physically exercised (all local runs arm64) — cover in Milestone D CI.

## Milestone B (desktop/proxy) — from final review
- docs-proxy healthcheck + upgrade desktop `depends_on` to `service_healthy` (alpine image has no `curl`; consider a 3-line `/healthz` bypass in the handler or a wget-spider probe).
- proxy image: run as non-root `USER`; pin base image tags; friendly error when `exam.yaml` is malformed (currently raw `yq` stderr).
- desktop: run websockify as `candidate` (currently root while X/XFCE run as `candidate`).
- proxy: response-direction + Connection-named hop-by-hop test coverage; whitespace-only `ALLOWED_DOMAINS` test; make 10s dial/header timeouts constants.
- allowlist: decide semantics for explicitly-empty `allowedDomains: []` (currently silently becomes the default list; either honor empty=block-all via `os.LookupEnv` or document); multi-trailing-dot hosts over-block (cosmetic).
- proxy: consider restricting CONNECT to ports 443/80.
- smoke: re-assert desktop ssh after `./sim reset` (pins shared-key persistence).
- proxy: unit test for CONNECT buffered-drain path (client pipelining bytes with CONNECT; assert they reach backend)

## Milestone C (facilitator/UI) — from reviews
- facilitator: kill established desktop WebSocket tunnels at session end (still open; Milestone D's first-party RFB client disconnects on unmount, reconnects are refused server-side, but a live socket in a stale tab still survives into ended).
- ~~ui: add vitest harness for timer/format utils~~ (done in Milestone D: vitest + testing-library + axe; 31 tests).
- facilitator image: run as non-root `USER`; pin base image tags (mirror of the Milestone B proxy item).
- facilitator: results/attempt history (single session.json overwritten per attempt). ~~Related: add a session generation token~~ — DONE in milestone D: `Start()` mints an attempt token, the grader captures it, and `SetResults`/`SetGradeError` reject mismatches; session.json v2 also records its bank and cross-bank files are discarded on load.
- `SESSION_DURATION_OVERRIDE` is test-only — document/guard once hosted.
- `DELETE /api/session` is unauthenticated by design (localhost single-user); needs auth when hosted.
- score page: skipped checks (bad `# points:` header) are JSON-indistinguishable from 0-point failed checks; add a skipped marker to the results schema if bank-authoring errors should surface in the UI.
- desktop proxy: path.Clean stripped paths before proxying (../ segments currently forwarded verbatim while unlocked; hardening, not a bypass).
- ~~smoke: results assertion hardcodes 17 twice~~ (done in Milestone D: totals parsed from the grade run). GET / UI assertion should also check HTTP status (still open).

## Milestone D (conductor/catalog/design system) — new
- conductor: image runs as root and holds the docker socket by design; consider a socket proxy (e.g. filtered API) if the tool is ever multi-user.
- conductor: catalog is read once at boot; adding a bank requires a conductor restart. Fine locally; revisit if bank authoring becomes iterative.
- ui: visual regression pass in a real browser (Chrome extension was unavailable during development; WS upgrade + xfconf state verified instead). Do a manual light/dark + tour + toast walkthrough.
- desktop: xfdesktop may show a one-time "untrusted launcher" prompt on the Desktop icons (panel launchers are the primary path); investigate gio trust metadata if it annoys.
- ui: bundle is ~470KB min (noVNC + React); consider code-splitting the RFB client if cold loads matter.
