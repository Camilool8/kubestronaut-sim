# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Candidates preparing for the CNCF Kubernetes certifications — today
CKAD and KCNA — in the days or weeks before a real sitting. They are comfortable
in a terminal, they have Docker on their own machine, and they run the
simulator themselves: one candidate, one machine, one session, no
proctor and no cohort.

A secondary user is the bank author, usually the same person, writing
questions against [docs/bank-spec.md](docs/bank-spec.md).

## Product Purpose

An exam simulator for the Kubestronaut certification track, run locally.
It gives a timed, graded, environment-backed rehearsal of the real exam:
an exam catalog, a countdown that cannot be paused, a real Linux desktop
with terminals, a real two-node Kubernetes cluster to act on, and a
per-check score with full solutions afterwards.

It is built to accompany a candidate across the whole Kubestronaut path
rather than a single sitting: graded attempts are kept, so weak domains
and progress along the five certifications are answerable at any point.

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

The grader also applies those weights directly, rather than relying on
that gate to make raw points come out right. The gate reads the authored
bank, so it certifies the bank; it says nothing about a *draw* taken
from one. Once an attempt can be a subset — a pooled bank, or a
candidate narrowing to two domains — the points a draw happens to
contain no longer carry the curriculum's shape, and only weighting the
result restores it. The raw earned-over-total figure is still reported
beside the weighted one, because a candidate is owed both.

**It is one part of preparing, and says so.** It does not replace working
a problem out for yourself, the lab a candidate builds at home, or the
Linux Foundation's own training. What it adds is a timed rehearsal on a
real cluster and a score that can be trusted. Positioning it as a
substitute for any of those would be both false and worse for the
candidate.

## Operating Context

Run locally with `./sim up`, then the browser. See
[README.md](README.md) for the quickstart,
[docs/architecture.md](docs/architecture.md) for the container and
network topology, and [SECURITY.md](SECURITY.md) for the threat model.

The parts that constrain product decisions:

- The session arc is exam selector, mode selector, timed exam view,
  submit or expiry, score, then the explanation of any one task — and
  from there a new attempt or an exam switch, the two that rebuild the
  whole environment behind a live progress checklist. A progress
  dashboard sits outside the arc, reachable whenever no attempt is
  running.
- `session.state` is still the outer switch and no screen contradicts
  it: a URL fragment only chooses between the views available *within*
  the state the server reports. `#/exams`, `#/exams/<id>/mode` and
  `#/progress` exist while idle, `#/results` and `#/results/<qid>` once
  an attempt has ended. So a refresh keeps its place, and a pasted link
  can never show a screen the session is not actually in.
- The exam desktop is XFCE with a terminal already open, Firefox
  restricted to a documentation allowlist, ssh to named instances as
  `candidate`, and a `/opt/course/<n>` working directory per question.
- `down` then `up` resumes state, including an in-progress session.
  `purge` deletes the volumes for a clean slate — except the attempt
  record, which only `purge --all` removes.
- Bank authoring is `banks/<bank>/exam.yaml` plus per-question
  `validate.d/` checks and `solution.md`.

## Capabilities and Constraints

**What runs today**

- One hands-on bank: CKAD Mock Exam 01, 22 questions across all five
  curriculum domains. 120 minutes, 66% to pass, Kubernetes 1.35, two
  instances, kind two-node cluster. Every attempt asks all 22 — that is a
  property of this bank, not of the engine. Pooling (`spec.examLength`)
  now works on both engines; a hands-on bank that opts in has its cluster
  seeded for the drawn subset when the attempt starts rather than for
  everything at boot, which is the trade that makes a large hands-on pool
  possible and is not worth taking for 22.
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

- **No authentication anywhere in the simulator, permanently.** `./sim
  up` is a local single-user tool; a password field would be theatre,
  and the only real control is which interface it binds to. This
  survived the hosted tier rather than being weakened by it: the hub is
  a separate process in front of the facilitator, which still has no
  authentication of any kind and is simply never reachable except
  through it. See [docs/hosting.md](docs/hosting.md).
- The session-state gates on desktop access and the solutions endpoint
  exist for UX fidelity, not security. Training mode deliberately
  relaxes the solutions gate, because reading the solution is the point
  of that mode.
- One session at a time. The live session file still holds exactly one
  attempt and is overwritten by the next, but a *graded* attempt is now
  also appended to a durable record (`/state/history.json`, its own
  volume) that survives a reset, a bank switch and `./sim purge`. That
  record backs cross-attempt analytics: best score and pass state per
  exam, weakest domains, and progress along the five-certification path.
  - Only **recorded** modes produce a record — Training is practice with
    the solutions open, and counting it would make every "best score"
    meaningless.
  - A recorded attempt is not automatically a *counted* one. A
    domain-filtered or short draw is kept and shown, but cannot set a
    best score or claim a pass: 100% on a ten-task drill of one domain
    is a good session and is not a CKAD pass.
  - Run locally it stays on the candidate's machine. Nothing is
    uploaded, and the only ways it leaves are the export the candidate
    asks for and the delete they confirm. In a hosted session it is
    additionally posted to the deployment that is hosting it, because
    the environment is destroyed on purpose and that copy is the one the
    candidate still has tomorrow — the local behaviour is unchanged and
    is the stricter of the two.
- The timer is server-side. In Exam mode it cannot be paused.
- **A hands-on attempt cannot be started from a touch-only device**, and
  the hub will not spend a seat on one. The refusal is at the door — the
  lobby card, the catalog row and the mode screen offer no control, and
  both Go services refuse the request — rather than at the exam screen,
  which is where it used to be: after a seat, a Pod boot or a
  two-to-four minute cluster rebuild had already been spent on an
  environment nobody in front of that screen could use.
  - Touch-only is `(any-pointer: coarse) and (not (any-pointer: fine))`,
    checked without reference to width. A tablet in landscape is 1024
    CSS px and has no more keyboard than a phone. A desktop window
    merely dragged narrow — or zoomed to 400%, which reports the same
    width — is a layout problem rather than a capability one and keeps
    its way through, because WCAG 1.4.10 makes 320 CSS px equivalent to
    1280px at 400% zoom.
  - **The client measures and declares; the server decides.** The SPA
    sends `X-Sim-Pointer` on every request and the rule lives in the hub
    and the facilitator. This is the inverse of the mode-capability
    pattern, and has one cause: no server can observe a pointer, and a
    User-Agent is a string the browser chooses. An absent header
    admits — `./sim`, `tests/smoke.sh` and every `curl` POST send none —
    so this is UX fidelity like the gates below it, not security.
- A running attempt on a small screen still gets its countdown and a
  submit control. The server-side clock does not stop for a change of
  device, and nobody may be stranded without a way to end an attempt.
- **The multiple-choice engine is built for the phone that can sit it**,
  rather than tolerated there: a collapsed topbar, a thumb-zone action
  bar, the navigator as a bottom sheet, and reading type that steps up
  rather than down. See DESIGN.md's Mobile section.
- The environment works offline wherever it can; assets are bundled
  rather than fetched from a CDN.
- **No third-party exam dump may ever be committed to this repository.**
  The banks are CC BY-SA 4.0, which requires them to be ours to license.

**Confirmed but not yet built**

- An extended-time option: a 1.25x/1.5x/2x multiplier on a *timed*
  attempt, for someone who wants the pressure of a countdown at a pace
  they set. Training mode already covers the untimed case.

**Hosted, with limits**

Overturned deliberately. "Hosting, accounts and multi-user separation
are out of scope" was a durable constraint until the hardware most
people have made it the wrong one: a 9GB, forty-minute first boot is a
real barrier to trying this at all. There is now a hosted tier, and the
shape of it is what kept the constraint above true.

- **The hosted tier is capped and the local one is the reference.**
  A hosted session is a try-it-out: a handful of concurrent hands-on
  seats, an idle timeout, and a hard cap on how long one lasts. Local is
  uncapped, has no accounts, and needs no configuration. Anyone who
  wants the uncapped one clones this.
- **The simulator did not change to make it possible.** Identity, seats
  and history live in `hub/`, a separate module that sits in front. The
  facilitator gained one optional webhook, off unless configured.
- **A third party can host it too**, with their own limits and their own
  identity — the chart takes an auth mode that trusts a proxy they
  already run. That is why the caps are values rather than constants.
- Still out of scope: anything that would make the local product assume
  an adversary. Nothing in `./sim up` does.

## Brand Commitments

- The name **kubestronaut-sim** is binding (owner decision, 2026-07-26).
  It stays in the repository, the UI and the CLI.
- Every surface that names a certification carries the non-affiliation
  notice: not affiliated with CNCF, The Linux Foundation, or PSI;
  Kubernetes and the certification names are trademarks of The Linux
  Foundation. It lives in the README and in the app's About panel beside
  a real-exam comparison table.
- **The brand does not position against another product.** Inspiration
  from open-source tooling, from commercial simulators and from sitting
  the real exams is real, and it stays out of the identity. The product
  is described by what it does, never as a version of something else.
- **Every mark in this product is original. No Kubernetes, CNCF or Linux
  Foundation artwork is used or implied**, in the app, on the landing
  page, or in the favicon. This is not caution for its own sake. The
  Linux Foundation's trademark policy requires written permission before
  a logo appears on a site promoting a product, and the certification
  badges are issued to individuals who pass an exam, for personal
  display — they are not available to a third party. Using them would
  also claim precisely the affiliation the notice above denies, and a
  disclaimer under a wall of official badges is not a defence. The
  certification acronyms as **text** are a different matter: naming an
  exam you prepare someone for is true factual reference, and it needs
  no permission. Marks live in `ui/src/components/CertMark.tsx`, drawn
  from the product's own orbit figure.
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
  and two tiers of hints; and 97 KCNA questions, each with a full
  explanation.
- A durable record of graded attempts on the candidate's own machine,
  which is what makes best-score, weakest-domain and path progress
  answerable at all. It is evidence about one candidate and never about
  a population — see the absences below.
- Reference solution scripts that must score 100%, the
  fresh-environment-scores-0 gate, and the curriculum weight check. See
  [docs/testing.md](docs/testing.md).
- A documented bank format ([docs/bank-spec.md](docs/bank-spec.md)) and a
  written record of where the simulator diverges from the real exam on
  purpose ([docs/follow-ups.md](docs/follow-ups.md)). Open work is in
  GitHub issues.

**Absences future work must not paper over:** there are no users,
testimonials, adoption numbers, pass-rate claims, or hosted service. The
attempt history is one candidate's own record on one machine, so it may
describe *their* progress and never a population's — no benchmark, no
percentile, no "candidates who score X". A bank that cannot produce a
meaningful score must not be offered at all.

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
