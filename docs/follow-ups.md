# Follow-ups (from Milestone A reviews — none blocking)

Convert to GitHub issues. The condition this line waited on since
Milestone A is met — the repo has a remote, it is public, and issues are
enabled — and there are currently none filed, so roughly forty open items
live only in this file.

Entries wrapped in ~~strikethrough~~ are closed; the parenthetical says
what closed them and where the evidence is. Nothing is deleted, so an
entry that was wrong stays visible as a wrong entry.

## Grading strictness / bank content
- ~~q01 `10_list-file.sh`: strip trailing whitespace on populated lines before diffing~~ (fixed in the quality/polish milestone: the check now builds both sides with `file_lines_sorted` and compares with `same_set`, and the ordering assertion strips CR and surrounding whitespace before comparing. Neither path can fail on spacing any more.)
- q01 `30_quota.sh`: accept equivalent resource quantities (e.g. `1000m` == `1`) instead of canonical-string match. Highest-value fix in this list. The normaliser now exists — `milli()` and `mib()` in `banks/_lib/checks.sh` — and this check does not yet source the library; it is still a canonical-string compare against a jsonpath result, so a candidate who wrote `1000m` fails a correct answer.
- ~~grader: tighten points guard to `(0|[1-9][0-9]*)` (leading-zero `08` currently hits bash octal parse)~~ (fixed in Milestone C: Go loader rejects leading zeros/negatives).
- ~~grader: wrap remote validate execution in `timeout` (connect-phase timeout exists; hung script still hangs grade). Add "checks must finish within N seconds" to bank-spec~~ (fixed in Milestone C: 30s per-check context timeout in evaluator).

## Images
- instance: regenerate ssh host keys in entrypoint (currently baked into the image layer, shared across deployments).
- instance: explicit `chmod 700` on `~/.ssh` dirs (currently relies on build umask).
- k8s-env: pin `yq-go` apk package explicitly (alpine `yq` alias ambiguity).
- ~~k8s-env: trap bootstrap failure to log a clear error before container exit (downstream currently sees only healthcheck timeout)~~ (fixed in Milestone J: `bootstrap.sh` has an `ERR` trap writing `/shared/boot.json` with the failing command, `start.sh` holds the container open on failure so the UI can render it and a retry can still exec in, and the dockerd wait is bounded and guarded on the daemon still being alive).

## Still open after Milestone J
- **Attempt history.** One attempt record, overwritten per attempt. Score
  trend over time needs a store in the `session` volume; `PRODUCT.md`
  still promises nothing about progress, and must keep not doing so
  until this exists.
- **Time per question.** `marksStore` records which questions were
  viewed, not when. Pacing is the most common CKAD failure mode and the
  score screen cannot currently say anything about it.
- **Per-question scratchpad notes.**
- **Node topology.** One control-plane + one worker means exactly ONE
  schedulable node (kind sets no `nodeRegistration.taints`, so kubeadm's
  control-plane `NoSchedule` stands). That is why the 22-question CKAD
  bank contains no affinity, anti-affinity, topology-spread, nodeSelector
  or toleration question — they are not gradeable. 1 control-plane + 2
  workers would unlock that category and is the minimum for CKA's
  drain/cordon and node-failure work. Costs ~+0.5-1GB RAM and 50% more
  `kind load` time per boot (mitigable with `kind load --nodes`).

## UX / docs
- `./sim grade` on a downed stack: friendly "run ./sim up first" message instead of raw compose error.
- smoke: add a `./sim ssh`-based assertion so the wrapper's ssh path is exercised.
- bank-spec: `kubernetesVersion` and `environment.nodes` remain informational (duration/passingScore enforced by Milestone C evaluator).
- README: mention `k8s-env` runs privileged (DinD requirement).
- Cross-arch: amd64 build/run path never physically exercised (all local runs arm64) — superseded by the entry in the quality/polish section below, which measures what CI now does and does not cover.

## Fidelity gaps (deliberate, worth naming)
- **One cluster, one context.** The real CKA/CKAD exams present several
  clusters and open each task with "switch context to X"; forgetting to
  is a classic way to zero a question you actually solved. We ship a
  single kind cluster and a single context, so that failure mode cannot
  be rehearsed here. Per-cluster node count already matches (a real CKAD
  cluster is 1 control-plane + 1 worker, which is what `kind-config.yaml`
  builds) — it is the *number* of clusters and the context switching that
  are missing.
- ~~**No CI.**~~ (fixed in Milestone J: `.github/workflows/ci.yml` runs
  the four bank validators, `go test` + `go vet` across all three
  modules, `tsc`/lint/vitest, every image build with `PRELOAD=none`, and
  a syntax parse of every shell script. `tests/smoke.sh` is deliberately
  NOT in it — it purges every volume and takes ~35 minutes.)

## Milestone B (desktop/proxy) — from final review
- docs-proxy healthcheck + upgrade desktop `depends_on` to `service_healthy` (alpine image has no `curl`; consider a 3-line `/healthz` bypass in the handler or a wget-spider probe).
- proxy image: run as non-root `USER`; ~~pin base image tags~~ (done: `proxy/Dockerfile:1,8` pin `golang:1.24-alpine` and `alpine:3.21`); friendly error when `exam.yaml` is malformed (currently raw `yq` stderr from `proxy/entrypoint.sh:14` under `set -eu`).
- desktop: run websockify as `candidate` (currently root while X/XFCE run as `candidate`).
- proxy: response-direction + Connection-named hop-by-hop test coverage; whitespace-only `ALLOWED_DOMAINS` test; make 10s dial/header timeouts constants.
- allowlist: decide semantics for explicitly-empty `allowedDomains: []` (currently silently becomes the default list; either honor empty=block-all via `os.LookupEnv` or document); multi-trailing-dot hosts over-block (cosmetic).
- proxy: consider restricting CONNECT to ports 443/80.
- smoke: re-assert desktop ssh after `./sim reset` (pins shared-key persistence).
- proxy: unit test for CONNECT buffered-drain path (client pipelining bytes with CONNECT; assert they reach backend)

## Milestone C (facilitator/UI) — from reviews
- facilitator: kill established desktop WebSocket tunnels at session end (still open; Milestone D's first-party RFB client disconnects on unmount, reconnects are refused server-side, but a live socket in a stale tab still survives into ended).
- ~~ui: add vitest harness for timer/format utils~~ (done in Milestone D: vitest + testing-library + axe; 31 tests).
- facilitator image: run as non-root `USER`; ~~pin base image tags~~ (done: `facilitator/Dockerfile:1,8,16`). No Dockerfile in this repo carries a `USER` directive yet — the four of them are one pass, not four.
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
- ~~accessibility: WCAG 2.2.1 (Timing Adjustable) is weaker here than for a
  real assessment — this is a practice tool, so the essential-exception is
  hard to lean on. A practice mode (untimed, or a 1.25x/1.5x/2x multiplier
  on the lobby) would close it properly.~~ (closed in the quality/polish
  milestone by **Training** mode, which is untimed. `PRODUCT.md` states
  the claim: an unpausable countdown cannot satisfy 2.2.1, and an untimed
  attempt does. The *extension* multiplier — 1.25x/1.5x/2x on a timed
  attempt — was not built and is not needed for the criterion; Speed mode
  goes the other way, halving the clock.)
- ~~trademark: "Kubestronaut" is a CNCF program name and the Linux Foundation's
  usage terms prohibit using their marks as part of a product name.~~
  (closed by owner decision, 2026-07-26, recorded in `PRODUCT.md` under
  Brand Commitments: the name **kubestronaut-sim** is binding and stays in
  the repository, the UI and the CLI. Every surface that names a
  certification carries the non-affiliation notice instead. This entry's
  original framing — "resolve before the repo is public" — is moot: the
  repo is public.)
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
- ~~images: bank workload images (`nginx:1.29-alpine` et al) are still
  pulled from the internet by the kind nodes on every reset~~ (fixed in
  Milestone J: `images/k8s-env/preload.txt` declares them, a `skopeo`
  build stage bakes them plus the CNI/ingress images to archives under
  `/opt/sim/images`, and `preload_images` loads archives with `kind load
  image-archive` before falling back to a pull. `nginx:1.99` and
  `nginx:0.0.0-corvus-nonexistent` are deliberately excluded — q02 and
  q11 are built on those tags NOT resolving.)
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
- ~~ui: the main bundle is ~487KB. Code-splitting the noVNC RFB client
  remains the obvious next win if cold loads matter.~~ (done: `Exam.tsx`
  lazy-imports `DesktopViewport`, which is the only module that imports
  `@novnc/novnc`, and the build emits it as a discrete chunk. The Milestone
  J entry below is the post-split measurement — ~349KB main plus a 183KB
  lazy chunk — not a restatement of this one.)
- test: no test covers the success-after-retry path on the lobby's catalog
  error card — click Retry, confirm the catalog renders. The wiring was
  traced by hand and is correct, but it's unexercised.
- ui: **convert the remaining API call sites to `useAsync`/`Async`.** The
  milestone's design claimed every fetch went through the primitive; one
  did. Since then the read-on-mount sites have been converted and the
  imperative ones have not. ~~The GET-on-mount sites — `Start.tsx`
  `getExam`/`getBanks`, `Exam.tsx` `getExam`, `QuestionPanel.tsx`
  `getQuestion` (the original hand-rolled `cancelled` flag `useAsync` was
  written to replace)~~ are done, and `Start`/`QuestionPanel` render
  through `<Async>`. Still hand-rolled:
  - `App.tsx` — `pollSession`, `getBoot`, `getControlStatus` (the control
    poll, needs `{background: true}`) and `getSession` on job completion.
  - `Start.tsx` — `startSession`, `getSession` on the 409 refetch,
    `startControlSwitch`.
  - `Exam.tsx` — `endSession` in both the confirm dialog and the mobile
    gate, and `practiceGrade`.
  - `Score.tsx` — `getResults` (the 3s poll), `endSession` behind Retry,
    `getSolution` per expanded question (a `.then/.catch/.finally` chain).
  What is left splits cleanly in two, and the halves want different
  treatment. The **imperative POSTs** each have an error branch and a
  `finally`, so they are correct as written; converting them buys the type
  error that makes the branch non-optional, plus `TopProgress`, which they
  do not currently feed. The **pollers** are the delicate ones
  (`background: true`, and a failed poll must not tear the poll down — see
  `Score.tsx`'s `pollError`). Mechanical, but it touches every screen, so
  it wants its own pass with the tests to match.

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
- ~~**Not verified in a real browser yet.**~~ (done 2026-07-28, Chrome, at
  1440/1100/900/600px in both themes. What it found is below.)

### What the real-browser pass found

The point of the pass, restated: **two of these three defects are
invisible to every automated gate in this repo**, because jsdom has no
layout engine and axe cannot see a 2px border offset.

- ~~**The desktop-required gate showed `0:00:00` on an untimed
  attempt**~~ (fixed). `ExamGateControls` read `session.remainingSeconds`
  with no `untimed` guard, so a training candidate who merely narrowed
  their window saw an expired-looking countdown and the copy "the clock
  keeps going wherever you are — submit here if you cannot get to a
  desktop in time". `TimerBar` has that guard and documents exactly why
  ("a frozen 00:00 would read as an attempt that had already run out");
  this path missed it. That makes it the FIFTH place the untimed guard was
  needed, against the four the milestone recorded. It also undermined the
  WCAG 2.2.1 claim, since the product's answer to Timing Adjustable is
  training mode and this screen told the user a clock was running out.
  Now counts up, announces "Time elapsed" rather than "Time remaining",
  and has its own copy. Two tests added — the existing `ExamGateControls`
  tests only covered submit failures.
- ~~**Every row divider in the score screen's domain breakdown was
  stepped**~~ (fixed, reported by the user during the pass).
  `.domain-table td` had `display: flex` to lay the bar beside the figure,
  which takes a cell out of the table layout model: the score cell
  measured 38px against the domain cell's 40px, putting the two
  `border-bottom`s 2px apart. The flex moved to a `.domain-score` wrapper.
  This also fixed the ≤600px layout, where `display: block` overrode the
  flex and left `.domain-bar` an inline span whose height never painted.
  Written up as *The Table-Cell Rule* in `DESIGN.md`.
- **Exam-centric copy survives into training mode.** Still open, and a
  cluster rather than one bug: with Training selected the lobby button
  still reads "Start Exam" and the bullet above it still asserts "The
  timer starts the moment you click Start and cannot be paused" —
  contradicting the Training option's own "Untimed" description two lines
  below; mid-attempt the header button is "End Exam" and its dialog asks
  "End the exam?" and warns "grading will begin". The score screen gets
  this right ("Training attempt — not a comparable exam result"), so the
  fix is to make the rest agree with it. Copy-only, no logic.
- **Below ~1100px the exam desktop is cropped, not scaled.** The
  framebuffer keeps its size while the pane shrinks, so at 900px the left
  edge — where the shell prompt and everything the candidate types
  lives — is off-screen with no horizontal scroll. The gate's stated
  minimum is 1024px, so this is within the "narrow but allowed" band that
  `Continue anyway` leads to. Either scale the framebuffer to the pane or
  say the desktop needs more room.

**Verified good, so nobody re-checks them:** the jump grid and clipboard
panel both leave `.desktop-pane` byte-identical and fire its
`ResizeObserver` **zero** times across repeated toggles (the whole reason
they are positioned out of flow); the hidden `smoke-01` bank is absent
from the lobby while CKA shows as coming-soon; light and dark both render
correctly at every width; motion is authored additively inside
`prefers-reduced-motion: no-preference` (21 rules) behind a global
`reduce` guard; and the training timer counts up, which is the
non-motion channel that rule requires.

**One limitation worth recording:** the extension's full-page screenshot
serves a stale composited frame for a second or two after a theme change,
which reads exactly like a broken theme. Region `zoom` is current.
Verify colour from `getComputedStyle`, not from a screenshot.

## Quality and polish milestone (boot, keys, clipboard, modes, grading) — new

Written after the fact, during a follow-up audit: this milestone shipped
without adding its own entries here, so what follows is the debt it left
rather than a plan it made.

- ~~**`tests/smoke.sh` has never been run against this code.**~~ (run
  2026-07-28, twice. It found five failures — one real grading bug and
  four broken assertions, every one of them code this milestone added and
  never executed. Details below.)

### What the first smoke run found

Worth keeping as the record of what "written but never run" costs.

- **`q21/validate.d/30_adapted.sh` called `contains_pair` without
  sourcing `_lib/checks.sh`** — 3 points, deterministic, on a correct
  answer. The run printed the proof: `no 'cpu 42' line; got: cpu 42|mem
  71`. The adapter had done exactly the job; bash said `command not
  found` and the runner scores a crashed check as failed. This was
  introduced by the same milestone that converted the check to the helper
  in the first place. `tests/check-lint.sh` now has an `unsourced-helper`
  rule so it cannot recur; `q07` defines `milli`/`mib` locally and is
  correctly exempt.
- **Smoke's own failed-check diagnostic crashed.** It embeds Python in a
  single-quoted shell string and escaped its dict keys as `\"id\"`, which
  Python rejects. It only runs when an assertion fails, so the code
  written to explain a failure died at the first failure it ever saw.
- **The hidden-bank assertion could never pass.** It grepped the whole
  `/api/control/banks` body for `smoke-01` immediately after switching TO
  smoke-01, so it always matched the `"active"` field.
  `catalog.List()` filters hidden entries correctly — only the test was
  wrong. It now reads the `banks` array, and also asserts `ckad-mock-01`
  is present so an empty list cannot pass by accident.
- **The training-mode results assertion expected the wrong status.** It
  wanted 202 from `GET /api/results` during a running training attempt.
  `handleResults` returns **409** whenever the state is not `ended`; 202
  means ended-and-still-grading, which a running attempt cannot be. 409 is
  what proves the practice grade was not recorded, and the Go unit tests
  already pinned that contract — the smoke assertion contradicted them.
- **`wait_workloads` gated on stale Deployment status.** This is the one
  worth remembering. After `./sim down && ./sim up` the node
  re-registers and its pods sit in `Unknown` for ~40s, while each
  Deployment's `.status` still holds its pre-restart values. So
  `kubectl wait --for=condition=Available` *and* a `readyReplicas`
  comparison both return instantly against stale data — measured
  directly: every Deployment reported full `readyReplicas` while 38 pods
  were `Unknown`. The grade then read live state and collapsed, twice
  (134/180, then 128/180), which reads exactly like a resume regression
  and is not one. **Resume is fine**: waiting on live pod phase, the same
  environment settles in ~52s and grades 180/180. The wait now polls pod
  phase, requires the calm to hold twice, and deliberately does not wait
  on `Error`/`CrashLoopBackOff`, which this bank creates on purpose.

- **Training-mode server gates are covered only by `smoke.sh`**, which CI
  excludes by design. `smoke.sh` says as much at the top of that block:
  it is the only place they meet a real facilitator rather than a stub.
  Nothing gates that logic on push. Three of the five defects above were
  in that same never-run category, so this is not a theoretical gap.
- ~~**23 `check-lint` warnings, all `index`, across 17 validator files.**~~
  (triaged to zero. Most became selectors by container name or by port
  value; `q10`'s `accessModes[0]` became `[*]`, which is also stricter
  than what it replaced; only `q18`'s v1beta1 migration kept `[0]`, with
  `# lint: allow-index` and the reason — `legacy.yaml` holds exactly one
  rule and one path, and the question forbids changing them.
  **One of the 23 was a real bug, not a cleanup**: `q08` read
  `.spec.rules[0].http.paths[]`, so an Ingress written as two rules with
  one path each — equally correct, identical controller behaviour —
  failed a question the candidate had answered.)
- **8 of 75 validator scripts source `banks/_lib/checks.sh`.** The
  de-brittling reached the eight files it set out to fix. Whether the
  library should reach further is a decision nobody has recorded — and
  `q01/validate.d/30_quota.sh` was proof the answer is sometimes yes: it
  string-matched `5 1` and so failed a candidate who wrote `1000m`. It
  now compares through `milli()`. The reference solution for q01 is
  deliberately written in the sloppier spelling (`1000m`, a trailing
  space, a CR) so that smoke's standing "solved env scores 100%"
  assertion *is* the proof the normalisers work, rather than something
  asserted separately and never run.
- ~~**Two design-system findings sit unresolved in `ui/src/theme.css`**: a
  `font-size: 0.68rem` off the type scale and a `border-radius: 3px` under
  the `--radius-s: 6px` floor.~~ (both closed, and they wanted opposite
  answers. The badge's 0.68rem was below the smallest step for no reason
  the scale did not already cover — uppercase at 0.06em tracking already
  reads larger than its nominal size — so it folded onto `--text-xs`,
  which also makes "COMING SOON" legible. The 3px was doing real work: a
  radius reads relative to the box it rounds, and the inline code chip is
  ~19px tall against the ~40px controls 6px was chosen for, so 6px there
  is an over-rounded chip in the middle of a sentence. It became a
  documented `--radius-xs`, scoped in DESIGN.md to inline chips only.)
- **The macOS keymap and clipboard work has no manual pass.** Unit tests
  cover the keysym table and modifier sequencing; nothing covers a real
  Mac against a real desktop — every chord, unmapped chords still passing
  through, bare ⌘ not leaving Super asserted, the panel fallback in a
  browser that refuses clipboard reads, and drag-select in the terminal
  not clobbering the host clipboard.
- ~~**The grading-tolerance proof was never written.**~~ (done, in the
  place it costs nothing to run: `tests/solutions/ckad-mock-01/q01.sh`
  now answers in the sloppier of two correct spellings, so the existing
  100% assertion covers it. Verified end to end — 180/180 with that
  solution in place.)
- **Cross-arch is half-covered now, not uncovered.** CI runs on amd64 and
  builds every image, which exercises the build path — but with
  `PRELOAD=none`, so the archive baking never runs there, and
  `images/k8s-env/Dockerfile` notes skopeo bakes the build host's
  architecture without `--override-arch`. The amd64 *run* path is still
  untested. (Supersedes the "cover in Milestone D CI" line under UX/docs.)
- `DESIGN.md` does not describe this milestone's UI. `BootProgress`,
  `HintTray`, `ClipboardPanel`, `DomainBreakdown`, `KeyboardSettings` and
  `ShortcutHelp` appear nowhere in it, and the boot gate — a whole-app
  blocking wait — is not among the Four Pending Tiers even though it has
  to satisfy the Non-Motion Channel Rule. `.impeccable/design.json` is a
  generated mirror and is stale for the same reason.
