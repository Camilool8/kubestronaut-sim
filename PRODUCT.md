# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Candidates preparing for the CNCF Kubernetes certifications — today CKAD
and CKA — in the days or weeks before a real sitting. They are already
comfortable in a terminal, they have Docker on their own machine, and
they run the simulator themselves, unsupervised. There is no proctor, no
instructor, and no cohort: one candidate, one machine, one session at a
time.

The product is distributed as public open source that candidates
self-host. Nobody operates it on their behalf.

A secondary user is the bank author — usually the same person — writing
and validating questions against `docs/bank-spec.md`.

## Product Purpose

A killer.sh-style exam simulator for the Kubestronaut certification
track, run locally. It gives a timed, graded, environment-backed
rehearsal of the real exam: an exam catalog, a countdown that cannot be
paused, a real Linux desktop with terminals, a real two-node Kubernetes
cluster to act on, and a per-check score with full solutions afterwards.

Success is a candidate who walks into the real exam having already felt
the time pressure and the tooling, carrying a score they have reason to
trust.

## Positioning

Deliberately harder than the real exam, and graded on **behaviour**
rather than on the shape of the YAML — a policy that actually denies, an
Ingress the controller really routes, an adapter whose output its
neighbour can read.

That is possible because the environment is complete enough to test an
answer the way the real exam expects: Calico instead of kindnet so
NetworkPolicies are genuinely enforced, ingress-nginx so Ingress
questions have a controller, a local Helm repository and a container
registry so the rest of the curriculum is answerable without the
internet.

Trust in the score is enforced by the build, not asserted: a fresh
environment must score 0, the reference solutions must score 100%, and
each domain's share of the points must track the published curriculum
weights within 2 percentage points.

## Operating Context

- `./sim up` on Docker Desktop or docker + compose v2, ~9GB RAM free,
  then `http://localhost:8080` and never the CLI again.
- Ports bind to all interfaces by default, so the environment can be
  built on a desktop and the exam sat from a laptop on the same network.
  `SIM_BIND=127.0.0.1` restricts every published port to loopback.
- The session arc: lobby catalog → timed exam view (question panel
  beside an embedded VNC desktop) → submit early or let the timer expire
  → score with per-check results and solutions → new attempt or switch
  exam, both of which rebuild the whole environment behind a live
  progress checklist.
- The exam desktop is XFCE with the terminal already open, Firefox
  restricted to an allowlist of documentation domains, ssh to named
  instances as `candidate`, and a `/opt/course/<n>` working directory per
  question.
- `down` then `up` resumes state, including an in-progress session.
  `purge` deletes the volumes for a clean slate.
- Containers: `conductor` (the only one mounting the Docker socket, kept
  off the exam network), `facilitator` (session, grading, API),
  `proxy` (documentation allowlist), `desktop`, the exam `instances`,
  and `k8s-env`.
- Bank authoring: `banks/<bank>/exam.yaml` plus per-question
  `validate.d/` checks and `solution.md`. `tests/smoke.sh` is the
  end-to-end gate — roughly 35 minutes, and destructive.

## Capabilities and Constraints

**What runs today**

- Two hands-on banks: CKAD Mock 01 (22 questions across all five
  curriculum domains) and CKA Mock 01 (2 questions). Both are 120
  minutes, 66% to pass, Kubernetes 1.35, two instances, kind two-node
  cluster.
- Advertised but not runnable, shown disabled in the catalog with the
  reason: KCNA and KCSA (the multiple-choice engine is not built) and
  CKS (needs security add-ons the kind environment does not have).
- Hands-on is the only exam engine that exists.

**Durable constraints**

- **No authentication anywhere, permanently.** This is a local
  single-user tool; a password field would be theatre. Anyone who can
  reach port 8080 can start and end the exam and open a real shell with
  cluster-admin. The only real control is which interface it binds to.
- The session-state gates on desktop access and the solutions endpoint
  exist for UX fidelity with the real exam. They are **not** a security
  boundary — every bank file, `solution.md` included, already sits
  unencrypted on the candidate's own disk.
- One session at a time, and one attempt record overwritten per attempt.
  There is no attempt history and no cross-attempt analytics.
- The timer is server-side. In exam mode it cannot be paused.
- The exam requires a desktop: a keyboard and room for a terminal beside
  the questions. Small screens get an explicit explanation instead of a
  broken layout.
- The environment should work without the internet wherever it can;
  assets are bundled rather than fetched from a CDN.
- **No third-party exam dump may ever be committed to this repository**,
  not even temporarily. The banks are licensed CC BY-SA 4.0, which
  requires them to be ours to license. `.gitignore` enforces the rule;
  any local dump is a topic map while authoring, nothing more.

**Confirmed but not yet built**

- **Practice mode.** An untimed or 1.25x/1.5x/2x duration option is
  intended scope. Strict, unpausable timing stays the default; future
  work should treat session duration as a per-attempt choice rather than
  a constant.

**Explicitly out of scope**

- Hosting, accounts, and multi-user separation. Local single-user is the
  permanent model, so notes elsewhere in the repo of the form "needs
  auth once hosted" describe a scenario that is not planned, not work
  that is pending.

## Brand Commitments

- The name **kubestronaut-sim** is binding (owner decision, 2026-07-26).
  It stays in the repository, the UI and the CLI. The trademark
  follow-up in `docs/follow-ups.md` is closed by that decision, not
  outstanding.
- Every surface that names a certification carries the non-affiliation
  notice: not affiliated with CNCF, The Linux Foundation, PSI, or
  killer.sh; Kubernetes and the certification names are trademarks of
  The Linux Foundation. It lives in the README and in the app's About
  panel beside a real-exam comparison table. New surfaces that name the
  certifications carry it too.
- Licensing is stated rather than implied: Apache-2.0 for code,
  CC BY-SA 4.0 for question banks (`banks/LICENSE`).
- Voice, as established across the README, SECURITY.md and the UI: plain,
  specific, and unhedged. It states what is defended and what is not
  instead of reassuring, and it puts the reason next to the rule. All
  user-facing copy is centralised in `ui/src/strings.ts` and stays there.

## Evidence on Hand

- Real, runnable question content: 22 CKAD questions and 2 CKA
  questions, each with per-check validators and a written solution
  (`banks/`).
- Reference solution scripts that must score 100%
  (`tests/solutions/<bank>/qNN.sh`), the fresh-environment-scores-0 gate,
  and the curriculum weight check (`tests/bank-weights.sh`) — all run
  inside `tests/smoke.sh`.
- A documented bank format (`docs/bank-spec.md`) and a running record of
  known gaps per milestone (`docs/follow-ups.md`).

**Absences future work must not paper over:** there are no users,
testimonials, adoption numbers, pass-rate claims, benchmarks, pricing, or
hosted service. There is no attempt history, so nothing may promise
progress over time. The CKA bank holds 2 questions, not an exam's worth,
and must never be presented as complete.

## Product Principles

1. **Harder than the real thing, and honest about the difference.**
   Difficulty is a deliberate calibration. Where the simulator diverges
   from the real exam, it says so rather than quietly drifting.
2. **Grade behaviour, not spelling.** A check earns its keep by
   asserting that the thing the question is about actually works.
   Equivalent answers pass; the grader is not a string comparison.
3. **A claim the test suite doesn't hold up doesn't ship.** Score
   integrity is enforced by gates in the build, not by intention.
4. **State the boundary instead of implying one.** No auth, solutions
   readable on disk, cluster-admin in the candidate's hands — each is a
   stated choice with its reason, never dressed up as protection.
5. **The candidate's machine, the candidate's data.** It runs locally,
   works offline where it can, and uploads nothing.

## Accessibility & Inclusion

- Target is WCAG 2.1 AA. `axe` runs in the test suite
  (`ui/src/a11y.test.tsx`), and both light and dark themes are checked.
- **Known open gap: WCAG 2.2.1 Timing Adjustable.** The
  essential-exception is weak for a practice tool. The confirmed
  practice-mode capability above is the intended fix; until it ships, the
  gap is real and acknowledged rather than argued away.
- The desktop requirement is functional, not a styling shortcut. Small
  screens get an explanation of why, while the catalog and past scores
  stay readable there.
