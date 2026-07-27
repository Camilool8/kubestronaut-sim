# Follow-ups (from Milestone A reviews — none blocking)

Convert to GitHub issues once the repo has a remote.

## Grading strictness / bank content
- q01 `10_list-file.sh`: strip trailing whitespace on populated lines before diffing.
- q01 `30_quota.sh`: accept equivalent resource quantities (e.g. `1000m` == `1`) instead of canonical-string match. Highest-value fix in this list. Milestone G's `q07/validate.d/30_resources.sh` has the normaliser to copy — it compares CPU in millicores and memory in MiB rather than by spelling, so `0.1` and `100m` both pass.
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
- ~~ui: visual regression pass in a real browser (Chrome extension was unavailable during development; WS upgrade + xfconf state verified instead). Do a manual light/dark + tour + toast walkthrough.~~ (done in Milestone F: real-browser pass at three widths, light and dark. It found three of the four defects that milestone fixed — the skip-link leak, the dead "New attempt" button, and unstyled solution markdown — none of which axe or vitest's jsdom could see.)
- ~~desktop: xfdesktop may show a one-time "untrusted launcher" prompt on
  the Desktop icons (panel launchers are the primary path); investigate gio
  trust metadata if it annoys.~~ (the real defect was worse than a prompt,
  and fixed in milestone J: both Desktop icons failed outright with "This
  feature requires a file manager service to be present (such as the one
  supplied by Thunar)". xfdesktop does not exec a .desktop file itself, it
  hands it to the org.xfce.FileManager D-Bus service, and no provider was
  installed. `thunar` is now in the desktop image — D-Bus activated, so it
  costs nothing until an icon is used. Verified by invoking
  org.xfce.FileManager.Launch on both icons: firefox-esr 0 -> 1 processes,
  xfce4-terminal 0 -> 1. No trust prompt appeared; the icons are executable
  and owned by candidate, which satisfies the check.)
- ui: bundle size — superseded by the Milestone F/G entry below (~487KB).

## Milestone E (UI/UX overhaul) — new

- proxy: the allowlist matches host-or-subdomain with no deny-override, so
  allowing `kubernetes.io` necessarily allows `discuss.kubernetes.io`, which
  the real exam disallows. A small deny list on top of the allow list would
  close it (asserted in `allow_test.go` so the gap stays visible).
- proxy: `allowedDomains: []` in a bank still falls through to the default
  list rather than blocking everything — carried over from milestone B and
  still unresolved.
- ui: the control-progress bar is indeterminate. Making it determinate needs
  historical phase durations; the per-phase timings added in this milestone
  are the input, so a later pass can persist observed medians and weight the
  bar honestly.
- ui: no live log *pane*, only a one-line tail per phase. The conductor now
  streams exec output, so a "show full log" disclosure is cheap if wanted.
- accessibility: WCAG 2.2.1 (Timing Adjustable) is weaker here than for a
  real assessment — this is a practice tool, so the essential-exception is
  hard to lean on. A practice mode (untimed, or a 1.25x/1.5x/2x multiplier
  on the lobby) would close it properly. Product decision, not a bug.
- trademark: "Kubestronaut" is a CNCF program name and the Linux Foundation's
  usage terms prohibit using their marks as part of a product name. The
  palette is fine (colours are not the exposed part); the *name* is. Worth
  resolving with trademarks@linuxfoundation.org before the repo is public.
- ~~verification: the live CKAD->CKA switch round-trip was not re-run at the end
  of this milestone because a timed session was in progress and ending it
  would have destroyed an attempt. Everything else was verified; run
  `tests/smoke.sh` from an idle stack before merging.~~ (ran and passed on
  main, 2026-07-25.)

## Milestone H (CKAD bank) — new

- ~~**domain weighting is skewed toward Application Design and Build**:
  28.1% of the points against a 20% target~~ (fixed in Milestone I:
  points are now derived from `spec.domainWeights` rather than assigned
  per question, so all five domains land exactly on target and cannot
  drift again — `tests/bank-weights.sh` fails the build if they do. See
  "Points and domain weights" in `docs/bank-spec.md`.)
- the bank is 22 questions where the real CKAD is 15–20. That is
  deliberate (this simulator is meant to be harder), but a 2-hour
  duration against 22 questions is tighter than the real exam's ratio;
  worth revisiting if attempts routinely run out of time.

## Milestone G (environment) — new

- ~~**instances: rootless podman.** The instances run `privileged: true`
  solely so podman can build images~~ (largely fixed in Milestone I: the
  Debian 13 base brings podman 5.4.2, which honours the `containers.conf`
  settings 4.3.1 ignored — including `default_sysctls`, the exact wall
  this entry described. The instances are no longer privileged; they hold
  five capabilities, listed and justified in `docker-compose.yaml` and
  `SECURITY.md`.)
  - still open, smaller: **rootless podman as `candidate`**, which would
    drop the remaining five. Not retried under 5.4.2 — the rootful path
    was enough to remove `privileged`, and the question tells candidates
    to use `sudo` in any case (as the real exam's does). `SYS_ADMIN` is
    the one worth removing if anyone returns to this.
- images: bank workload images (`nginx:1.29-alpine` et al) are still
  pulled from the internet by the kind nodes on every reset. The CNI and
  ingress images are pre-pulled into the persistent DinD cache and
  side-loaded with `kind load`; extending `preload_images` to a list the
  bank declares would make a reset fully offline.
- ingress: image digests are stripped from the vendored ingress-nginx
  manifest at build time, because `kind load` names images by tag and a
  kubelet asked for `tag@digest` would go to the network anyway. Version
  pinning survives via the vendored manifest; digest pinning does not.
- ingress: the ValidatingWebhookConfiguration is left in place. It is
  what a real cluster has, but if a candidate's Ingress ever gets
  rejected at `apply` time because the controller is briefly unavailable,
  deleting it is the usual kind workaround.
- storage: podman uses the `vfs` driver. `overlay` + `fuse-overlayfs` was
  verified working under `privileged` and is the faster choice for large
  base images; at the sizes the questions use, both took four seconds.

## Milestone F (UI polish) — new

- design: `--accent` on `--surface-raised` measures 4.12:1 in the light
  theme, below WCAG AA's 4.5:1 for normal text. Code-block highlighting
  sidesteps it by using `--accent-strong` instead (5.57:1 light, 8.52:1
  dark), so nothing new regresses, but the weaker pairing is still sitting
  in the palette available for other uses. Worth an audit of where else
  `--accent` on `--surface-raised` might already be in play.
- test: reading a stylesheet off disk via a non-literal
  `import("node:" + "fs")`, to dodge a `tsc` error with no `@types/node`
  in the project, now lives in one place — `ui/src/test/readCss.ts` —
  with two consumers (`Markdown.test.tsx` and `styles/layout.test.ts`).
  It works, and what it checks was verified by hand, but a regex over CSS
  text is still standing in for a real style assertion. Delete the whole
  helper for a typed `node:fs` import if `@types/node` ever enters the
  project.
- ~~bug: `highlight.ts` caches a rejected promise forever.~~ (stale entry —
  verified fixed: `engine()` clears `enginePromise` in its `.catch` and
  documents why. Struck during milestone J.)
- ~~bug (theoretical): `Async` treats `data === undefined` as loaded — it
  only checks `!== null`.~~ (fixed in milestone J: `AsyncState` carries
  `hasData`, set by the reducer on success, and `Async` gates on that.)
- ~~bug: a synchronously-throwing `fn` passed to `useAsync` escapes the
  effect after `progressStore.start()` runs but before its matching
  `done()`, leaking the top progress bar visible permanently.~~ (fixed in
  milestone J: the call is wrapped in `Promise.resolve().then(...)`, with a
  test pinning that the bar clears.)
- ~~docs: `docs/bank-spec.md` still carries its own pre-existing 4-space
  indented `exam.yaml` example~~ (fixed in Milestone G: converted to a
  fenced `yaml` block along with the rest of that document).
- ui: the main bundle is ~487KB. Code-splitting the noVNC RFB client
  remains the obvious next win if cold loads matter. (Supersedes the
  Milestone D entry above — same item, measured again.)
- test: no test covers the success-after-retry path on the lobby's catalog
  error card — click Retry, confirm the catalog renders. The wiring was
  traced by hand and is correct, but it's unexercised.
- ui: **convert the remaining API call sites to `useAsync`/`Async`.** The
  milestone's design claimed every fetch went through the primitive; one
  does. The unconverted ones, as of the final fix wave:
  - `App.tsx` — `getControlStatus` (the control poll, needs
    `{background: true}`), `getSession` on job completion, and the
    `pollSession` helper in `api.ts` that owns the session poll.
  - `Start.tsx` — `getExam` (still a hand-rolled `cancelled` effect),
    `startSession`, `getSession` on the 409 refetch, `startControlSwitch`.
  - `Exam.tsx` — `getExam` (hand-rolled `cancelled`), `endSession` in both
    the confirm dialog and the mobile gate.
  - `Score.tsx` — `getResults` (the 3s poll), `endSession` behind Retry,
    `getSolution` per expanded question.
  - `QuestionPanel.tsx` — `getQuestion`, the original hand-rolled
    `cancelled` flag `useAsync` was written to replace.
  Every one of these now has an error branch, but it is hand-written and
  therefore optional: the review found five that were missing. The
  primitive makes the branch a type error to omit. Mechanical work, but it
  touches every screen, so it wants its own pass with the tests to match —
  the pollers especially (`background: true`, and a failed poll must not
  tear the poll down; see `Score.tsx`'s `pollError`).

## Milestone J (UI/UX refinement) — new

- **`exam.yaml` questions have no `title` field.** The only human-readable
  question title is the `# Question N | ...` h1 inside `question.md`, which
  the jump grid cannot show without fetching all 22 questions up front. The
  grid therefore groups by domain and labels tiles `qNN` + points. An
  optional `title` in the bank spec would let the grid say what a question
  is about; that is a `docs/bank-spec.md` change plus a facilitator field,
  so it stayed out of a UI-only pass.
- **`remark-gfm` was added** (~39KB raw, ~11KB gzip) because eight CKAD
  solution files are written with GFM pipe tables and react-markdown parses
  CommonMark only — every one rendered as literal rows of pipe characters
  on the score screen. Bundle is now ~349KB main plus the 183KB lazy noVNC
  chunk. Tables are the only GFM feature the banks use, so
  `micromark-extension-gfm-table` + `mdast-util-gfm-table` directly would
  be smaller if that ever matters.
- **The control-progress bar is still indeterminate by time.** The
  backgrounded-job chip added here is determinate by *step*
  (`done / phases.length`), which needs no history. A time-weighted bar
  still wants persisted per-phase medians — the per-phase timings are the
  input, as the milestone E entry above says.
- **The reduced-motion pending rule is written down** in `DESIGN.md`: every
  pending state carries at least one channel that changes without motion
  (an elapsed counter, a step label, an attempt number), motion layered on
  additively. Anything new that waits has to satisfy it.
- `useAsync` now hands its `fn` an `AbortSignal` and every `api.ts` call
  takes one, behind a 10s timeout. The still-unconverted call sites are the
  imperative POST handlers (`startSession`, `endSession`,
  `startControlSwitch`/`Reset`) and the two pollers (`pollSession`, and
  `Score`'s results poll). Each has an error branch and a `finally`, so
  they are correct as written — they simply do not feed `TopProgress`.
- **Not verified in a real browser yet.** Every gate in this repo is blind
  to CSS layout and motion, and this milestone moved layout in the one
  place that has a ResizeObserver watching it. The jump grid is
  `position: absolute` inside `.question-panel` specifically so opening it
  changes no flex geometry; that needs eyes on it at 1440/1100/900/600px,
  light and dark, with reduced motion emulated.
