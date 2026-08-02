# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Candidates preparing for the CNCF Kubernetes certifications — today
CKAD — in the days or weeks before a real sitting. They are comfortable
in a terminal, they have Docker on their own machine, and they run the
simulator themselves: one candidate, one machine, one session, no
proctor and no cohort.

A secondary user is the bank author, usually the same person, writing
questions against [docs/bank-spec.md](docs/bank-spec.md).

## Product Purpose

A killer.sh-style exam simulator for the Kubestronaut certification
track, run locally. It gives a timed, graded, environment-backed
rehearsal of the real exam: an exam catalog, a countdown that cannot be
paused, a real Linux desktop with terminals, a real two-node Kubernetes
cluster to act on, and a per-check score with full solutions afterwards.

## Positioning

Deliberately harder than the real exam, and graded on behaviour rather
than on the shape of the YAML.

That is possible because the environment is complete enough to test an
answer the way the real exam expects: Calico instead of kindnet so
NetworkPolicies are genuinely enforced, ingress-nginx so Ingress
questions have a controller, a local Helm repository and a container
registry so the rest of the curriculum is answerable offline.

Trust in the score is enforced by the build, not asserted: a fresh
environment must score 0, the reference solutions must score 100%, and
each domain's share of the points must track the published curriculum
weights within 2 percentage points.

## Operating Context

Run locally with `./sim up`, then the browser. See
[README.md](README.md) for the quickstart,
[docs/architecture.md](docs/architecture.md) for the container and
network topology, and [SECURITY.md](SECURITY.md) for the threat model.

The parts that constrain product decisions:

- The session arc is exam selector, mode selector, timed exam view,
  submit or expiry, score, then a new attempt or an exam switch — the
  last two rebuild the whole environment behind a live progress
  checklist. Only the first two are addressed by a URL fragment; every
  other screen is a pure function of the server's session state.
- The exam desktop is XFCE with a terminal already open, Firefox
  restricted to a documentation allowlist, ssh to named instances as
  `candidate`, and a `/opt/course/<n>` working directory per question.
- `down` then `up` resumes state, including an in-progress session.
  `purge` deletes the volumes for a clean slate.
- Bank authoring is `banks/<bank>/exam.yaml` plus per-question
  `validate.d/` checks and `solution.md`.

## Capabilities and Constraints

**What runs today**

- One hands-on bank: CKAD Mock Exam 01, 22 questions across all five
  curriculum domains. 120 minutes, 66% to pass, Kubernetes 1.35, two
  instances, kind two-node cluster.
- One multiple-choice bank: KCNA Mock Exam, 97 original questions
  pooled down to 65 per attempt (`spec.examLength`), in the real exam's
  shape — 90 minutes, 75% to pass, weighted to the post-November-2025
  curriculum domains on every draw, single-answer and
  select-all-that-apply, every question with a full explanation.
- Advertised but not runnable, shown disabled in the catalog with the
  reason: CKA and KCSA (banks not written) and CKS (needs security
  add-ons the kind environment lacks).
- Two exam engines: **hands-on** (ssh checks against the cluster) and
  **mcq** (answers stored in the session, graded in the facilitator —
  no cluster involvement, so an mcq attempt starts before the
  environment finishes booting and works on a phone).
- Three ways to run an attempt, offered gentlest first: **Training**
  (untimed, two-tier hints and solutions on demand, and scoring that
  does not end the attempt), **Mastery** (half the duration, no help)
  and **Exam** (the bank's duration, no help). What each one permits is
  defined once, in `facilitator/internal/session`, and both described to
  the UI and enforced by the handlers from there — so a mode card cannot
  advertise something the server then refuses.
  - Mastery is the wire id `speed`, and stays that way: renaming it
    would invalidate every persisted session and every stored attempt.

**Durable constraints**

- **No authentication anywhere, permanently.** This is a local
  single-user tool; a password field would be theatre. The only real
  control is which interface it binds to.
- The session-state gates on desktop access and the solutions endpoint
  exist for UX fidelity, not security. Training mode deliberately
  relaxes the solutions gate, because reading the solution is the point
  of that mode.
- One session at a time, and one attempt record overwritten per attempt.
  There is no attempt history and no cross-attempt analytics.
- The timer is server-side. In Exam mode it cannot be paused.
- The exam requires a desktop-sized screen. Small screens get an
  explanation instead of a broken layout.
- The environment works offline wherever it can; assets are bundled
  rather than fetched from a CDN.
- **No third-party exam dump may ever be committed to this repository.**
  The banks are CC BY-SA 4.0, which requires them to be ours to license.

**Confirmed but not yet built**

- An extended-time option: a 1.25x/1.5x/2x multiplier on a *timed*
  attempt, for someone who wants the pressure of a countdown at a pace
  they set. Training mode already covers the untimed case.

**Explicitly out of scope**

- Hosting, accounts, and multi-user separation. Local single-user is the
  permanent model, so notes elsewhere of the form "needs auth once
  hosted" describe a scenario that is not planned.
- Running this somewhere shared or persistent. Nothing in it assumes an
  adversary.

## Brand Commitments

- The name **kubestronaut-sim** is binding (owner decision, 2026-07-26).
  It stays in the repository, the UI and the CLI.
- Every surface that names a certification carries the non-affiliation
  notice: not affiliated with CNCF, The Linux Foundation, PSI, or
  killer.sh; Kubernetes and the certification names are trademarks of
  The Linux Foundation. It lives in the README and in the app's About
  panel beside a real-exam comparison table.
- Licensing is stated rather than implied: Apache-2.0 for code,
  CC BY-SA 4.0 for question banks ([banks/LICENSE](banks/LICENSE)).
- Voice is plain, specific, and unhedged. It states what is defended and
  what is not instead of reassuring, and puts the reason next to the
  rule.
- User-facing copy belongs in `ui/src/strings.ts`. Two files currently
  break this — `ui/src/components/ShortcutHelp.tsx` and
  `ui/src/lib/desktopKeymap.ts` hardcode visible strings — and should be
  pulled back in rather than copied from.

## Evidence on Hand

- 22 CKAD questions, each with per-check validators, a written solution
  and two tiers of hints.
- Reference solution scripts that must score 100%, the
  fresh-environment-scores-0 gate, and the curriculum weight check. See
  [docs/testing.md](docs/testing.md).
- A documented bank format and an open backlog
  ([docs/follow-ups.md](docs/follow-ups.md)).

**Absences future work must not paper over:** there are no users,
testimonials, adoption numbers, pass-rate claims, or hosted service.
There is no attempt history, so nothing may promise progress over time.
A bank that cannot produce a meaningful score must not be offered at
all.

## Product Principles

1. **Harder than the real thing, and honest about the difference.**
   Where the simulator diverges from the real exam, it says so.
2. **Grade behaviour, not spelling.** Equivalent answers pass; the
   grader is not a string comparison.
3. **A claim the test suite doesn't hold up doesn't ship.**
4. **State the boundary instead of implying one.**
5. **The candidate's machine, the candidate's data.** It runs locally,
   works offline where it can, and uploads nothing.

## Accessibility & Inclusion

- Target is WCAG 2.1 AA. `axe` runs in the test suite
  (`ui/src/a11y.test.tsx`), and both light and dark themes are checked.
- WCAG 2.2.1 Timing Adjustable is met by Training mode, which is
  untimed (`facilitator/internal/session/session.go:45`). Exam mode's
  unpausable countdown remains the default, and is a deliberate choice
  the candidate opts into rather than a constraint imposed on them.
- The desktop requirement is functional, not a styling shortcut. Small
  screens get an explanation of why, while the catalog and past scores
  stay readable there.
