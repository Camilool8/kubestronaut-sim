# Question bank specification (v1alpha2)

A bank lives at `banks/<bank-id>/` and holds `exam.yaml`, one directory
per question, and optionally a [`tips.md`](#exam-tips-banksbank-idtipsmd).
The conductor scans every `banks/*/exam.yaml` into the catalog
the exam selector renders; [banks/catalog.yaml](../banks/catalog.yaml) adds
coming-soon entries whose exam engine does not exist yet.

Seven gates decide whether a bank ships —
[bank-weights.sh](../tests/bank-weights.sh),
[check-lint.sh](../tests/check-lint.sh),
[check-lib.sh](../tests/check-lib.sh),
[check-evidence.sh](../tests/check-evidence.sh),
[check-expected.sh](../tests/check-expected.sh) and
[bank-hints.sh](../tests/bank-hints.sh) for hands-on banks, and
[bank-mcq.sh](../tests/bank-mcq.sh) for multiple-choice ones. All are
offline; six run in CI today, and `check-expected.sh` joins them once
every check in both banks carries a declaration. Every one but
`check-evidence.sh` and `check-expected.sh` also runs at the top of
[tests/smoke.sh](../tests/smoke.sh), so a bank mistake fails in seconds
rather than forty minutes into a cold boot.

There are two exam engines. Everything down to
[Multiple-choice banks](#multiple-choice-banks-examtype-mcq) describes
the hands-on shape; that section describes where mcq banks differ.

## exam.yaml

This example passes every gate. Copy its shape.

```yaml
apiVersion: sim.kubestronaut.dev/v1alpha2
kind: Exam
metadata:
  name: ckad-mock-99
  title: CKAD Mock Exam 99
  certification: CKAD
  description: Developer-track exercises across the CKAD curriculum.
spec:
  examType: hands-on
  duration: 120m
  speedDuration: 60m
  passingScore: 66
  kubernetesVersion: "1.35"
  domainWeights:
    Application Design and Build: 20
    Application Deployment: 20
    Application Environment, Configuration and Security: 25
    Application Observability and Maintenance: 15
    Services and Networking: 20
  environment:
    provider: kind
    nodes: 2
    allowedDomains: [kubernetes.io, helm.sh, code.jquery.com]
  instances:
    - name: instance-1
    - name: instance-2
  questions:
    - id: q01
      title: Namespaces & ResourceQuota
      instance: instance-1
      domain: Application Environment, Configuration and Security
      weight: 25
    - id: q02
      instance: instance-1
      domain: Application Design and Build
      weight: 20
    - id: q03
      instance: instance-2
      domain: Application Deployment
      weight: 20
    - id: q04
      instance: instance-2
      domain: Services and Networking
      weight: 20
    - id: q05
      instance: instance-1
      domain: Application Observability and Maintenance
      weight: 15
```

Its points total 100 and every domain's share equals its target exactly. One
question per domain is the floor; a real bank splits each budget over several
— see [banks/ckad-mock-01/exam.yaml](../banks/ckad-mock-01/exam.yaml).

Keep the `questions:` keys in that order, one per line, with no inline
comments.

[bank-weights.sh](../tests/bank-weights.sh) parses the block with a
regex, not a YAML library. A reordered key or a trailing comment hides a
question from the gate, which then fails the bank for disagreeing with
the directory listing.

Where the optional keys go:

| Key | Position |
|---|---|
| `title:` | *Inside* the run, directly after `id:`. Nowhere else |
| `targetSeconds:` | *After* the run, below `weight:` (hands-on) or `correct:` (mcq) |
| `difficulty:` | Same as `targetSeconds:` |
| `docs:` | Same as `targetSeconds:` |

| Field | Meaning and status |
|---|---|
| `metadata.name` | Bank id. Convention: the conductor rejects a mismatch with the directory name only when the field is non-empty ([catalog.go](../conductor/internal/catalog/catalog.go)) |
| `metadata.title`, `.certification`, `.description` | The exam card's fallback title, its heading and tinted avatar (`CKAD`/`CKA`/`CKS`), and its one-line blurb. `certification` also reaches `GET /api/exam`, where the mode screen's header reads it |
| `metadata.hidden` | Keeps the bank out of the exam selector while leaving it a legal `switch` target. Exists for `smoke-01`; a bank worth shipping is worth listing |
| `spec.examType` | `hands-on` (the default when absent, [catalog.go](../conductor/internal/catalog/catalog.go)) or `mcq`; any other value lists the bank disabled with a "no engine yet" note |
| `spec.duration` | The Exam clock. Enforced: the facilitator ends the session at 0:00 |
| `spec.speedDuration` | The clock for the `speed` mode, defaulting to half `spec.duration` ([exam.go](../facilitator/internal/exam/exam.go)). A malformed value fails the load. What `speed` is called on screen, and what else it changes, is in [api.md](api.md#attempt-modes) |
| `spec.passingScore` | Percent. Enforced by the facilitator's `Results.Passed` |
| `spec.kubernetesVersion` | Informational; shown on the catalog card |
| `spec.domainWeights` | The certification's published weights, and a runtime value in three places: `exam.Load` builds `Exam.Domains` from it, `exam.Draw` stratifies a pooled or filtered draw by it, and both graders weight the final score by it. [bank-weights.sh](../tests/bank-weights.sh) still gates it too. Getting it wrong now moves real scores, not just a build check |
| `spec.difficultyMix` | Optional, hands-on. Opts a **pooled** bank into a second stratification: the percentage of a drawn attempt that should be `quick`, `core` and `deep`. Must sum to 100, must name only those three tiers, and every question in the bank must then declare a `difficulty` and a `targetSeconds`. Absent — every bank in this repo but `ckad-mock-01` and `cka-mock-01` — the draw is stratified by domain alone and nothing changes. See [Mixing a draw by level](#mixing-a-draw-by-level-specdifficultymix) |
| `spec.examLength` | Optional, **both engines**. Pools the bank: author more questions than one attempt should ask, set this to the smaller per-attempt count, and `exam.Draw` takes a fresh domain-stratified subset every start. Must be positive and no larger than the pool — `exam.Load` rejects both, because an `examLength` typo that silently turns pooling *off* is worse than one that fails the boot. A pooled bank must declare `spec.domainWeights`; the draw stratifies against them and errors without. Absent or `>=` the pool means no pooling; every listable bank in this repo pools — `ckad-mock-01` draws 17 of 44, `cka-mock-01` 16 of 26, `kcna-mock` 65 of 97. **A pooled hands-on bank also changes when its cluster is seeded** — see below |
| `spec.environment.nodes` | **The size of this exam's cluster.** [bootstrap.sh](../images/k8s-env/bootstrap.sh) copies `kind-config.yaml` — which holds the control-plane node and nothing else — and appends one `- role: worker` per extra node before `kind create cluster`. Absent means 2; anything that is not a positive integer fails the boot rather than falling back, because a cluster silently the wrong size is discovered by a drain question grading zero. Also served on `GET /api/exam` so the screens that describe the environment while it builds describe the one being built |
| `spec.environment.provider` | Informational; `kind` is the only one that exists. Served on `GET /api/exam` beside `nodes` |
| `spec.environment.addons` | Optional list; only `gateway-api` is recognized. Installs the prebaked Gateway API CRDs and nginx-gateway-fabric controller and seeds GatewayClass `sim`. Absent means no addons ([bootstrap.sh](../images/k8s-env/bootstrap.sh)) |
| `spec.environment.allowedDomains` | Domain suffixes the desktop browser may reach through the docs proxy, subdomains included ([proxy/entrypoint.sh](../proxy/entrypoint.sh)). Omit it to inherit `allow.DefaultDomains` ([allow.go](../proxy/internal/allow/allow.go)), the smallest set that leaves the documentation sites usable |
| `spec.instances` | 1 or 2 entries. Convention: names outside `instance-1`/`instance-2` only mark the bank unavailable in the exam selector ([catalog.go](../conductor/internal/catalog/catalog.go)), and the facilitator's exam loader never parses the block at all |
| `spec.questions[].id`, `.instance` | Question directory name, and the ssh host the grader runs its checks on |
| `spec.questions[].title` | Optional short label shown in the question navigator, the jump grid and the score review. Absent, the UI falls back to the id (hands-on) or the attempt position (mcq) |
| `spec.questions[].domain` | Must match a `domainWeights` key |
| `spec.questions[].weight` | Must equal the sum of this question's `# points:` headers |
| `spec.questions[].targetSeconds` | Optional pacing budget, in seconds, shown on the task chip. Absent, the facilitator derives one from the question's weight's share of the exam clock ([exam.go](../facilitator/internal/exam/exam.go), `TargetSeconds`) and flags it `targetDerived` on `GET /api/exam`, so a derived figure is never presented as the author's judgement. `ckad-mock-01` and `cka-mock-01` set it on every question because their `spec.difficultyMix` requires one; `kcna-mock` sets none. It is a budget, never a limit: nothing enforces it and running over costs no points. Write it below `weight:` (hands-on) or `correct:` (mcq); both gate regexes end there, and a `targetSeconds:` line above them hides the question from the gate |
| `spec.questions[].difficulty` | `quick`, `core` or `deep`. Required on every question of a bank declaring `spec.difficultyMix`, and rejected on a bank that does not — a label nothing draws on is cruft. **The tier is its `targetSeconds` band, not a judgement**: `quick` is at most 240s, `core` 241-540, `deep` 541-840, and [exam.go](../facilitator/internal/exam/exam.go) refuses a bank whose label and budget disagree. Never sent to the client during an attempt: a question labelled `deep` on screen is a spoiler and an anxiety source |
| `spec.questions[].docs` | Optional upstream reading: a list of `{label, url}`. Shown in the post-attempt deep dive, and during a Training attempt — see [Documentation links](#documentation-links-specquestionsdocs). Write it below `weight:`/`correct:` for the same reason `targetSeconds` goes there |

## Documentation links: `spec.questions[].docs`

A question may name the upstream pages that explain its subject:

```yaml
    - id: q08
      title: Route two Services with one Ingress
      instance: instance-2
      domain: Services and Networking
      weight: 9
      docs:
        - label: Ingress
          url: https://kubernetes.io/docs/concepts/services-networking/ingress/
```

They appear in two places, and the difference between them is the mode:

- The footer of the **post-attempt deep dive**, in the candidate's own
  browser, once the attempt is over. Served on
  `GET /api/questions/{id}/solution`.
- Under the task itself during a **Training** attempt, where clicking one
  opens it as a tab in the exam desktop's Firefox. Served on
  `GET /api/questions/{id}/docs`, opened through
  `POST /api/questions/{id}/docs/open`.

**Mastery and Exam refuse both endpoints.** Documentation links are help,
and they sit behind the same `session.HelpAllowed` gate as hints and
solutions, so a recorded score still means the candidate found the page
themselves. The open endpoint additionally accepts only a URL that the
named question declares, so it cannot be used to put an arbitrary page in
front of the browser running on the candidate's desktop.

The links still resolve through the allowlist proxy
(`spec.environment.allowedDomains`) like any other page the desktop
fetches, so a `docs:` entry on a host the bank does not allow will open a
tab that cannot load.

Rules, all enforced by [exam.go](../facilitator/internal/exam/exam.go):

- `label` names the **concept**, not the URL: `Ingress path types`, not
  `kubernetes.io/docs/…`. The footer is read as a list of things to go
  and learn.
- `url` must be `https://` and must parse. **A bad entry is dropped and
  logged, never fatal** — every other load error refuses the bank because
  every other one is about the exam, while a mistyped study link must
  never stop someone taking one. The rest of the list still loads.
- Omit the key entirely when there is no single obviously-right page.
  Absent is the default and the response omits the field, which the UI
  renders as nothing at all. **A wrong link on a study tool is worse than
  no link**, so prefer a page-level URL over an anchor you are not certain
  of, and prefer nothing over a page you have not opened.

## Pooling a bank: `spec.examLength`

Set it and one attempt asks a subset instead of the whole bank:

- **Drawn fresh each start**, stratified so each domain contributes
  exactly its `domainWeights` share (largest-remainder rounding).
- **Persisted with the session.** It survives a resume and a facilitator
  restart.
- **Scoped everywhere.** Grading, `GET /api/exam` and every
  single-question endpoint use the draw, so a pool question outside it
  is a 404 rather than merely ungraded.
- **Reproducible.** The same seed against the same pool gives the same
  draw. `poolDigest` travels beside it, so "same seed, different
  questions" reports as a changed bank rather than a mystery.

**For a hands-on bank, pooling also moves when the cluster is seeded, and
that is the part to understand before opting in.** An unpooled hands-on
bank seeds every question at boot, inside the long progress screen a cold
start already shows. A pooled one cannot: the draw has not happened yet at
boot time, and seeding all of a large pool would be pointless work. So
[bootstrap.sh](../images/k8s-env/bootstrap.sh) skips its seed loop
entirely for a pooled bank (it still pre-pulls the bank's images, which is
the slow, network-fragile half and is identical whatever gets drawn), and
the drawn questions are seeded when the attempt starts instead:
`POST /api/session/start` answers **202** with a conductor job to watch,
and the candidate's clock does not begin until that job succeeds. See
[api.md](api.md) for the contract.

For an author:

- Pooling for **variety** is a good trade when the pool is much larger
  than an attempt.
- It is a bad trade when it is not. A bank pooling 22 down to 20 has
  moved four minutes of seeding from the boot screen to the moment the
  candidate presses Start, and gained almost no variety for it.

`ckad-mock-01` pools 44 down to 17 for both reasons. **Holding the attempt
to the right length** comes first: the real CKAD is 15-20 tasks in two
hours, and 17 is its midpoint.

The variety is worth stating plainly, because a draw that barely shrinks
the pool is pooling in name only:

| Domain | Pool | Rotation |
|---|---|---|
| Application Environment, Configuration and Security | 10 | 4 of 10 |
| Application Deployment | 10 | 4 of 10 |
| Services and Networking | 8 | 3 of 8 |
| Application Design and Build | 8 | 3 of 8 |
| Application Observability and Maintenance | 8 | 3 of 8 |

Deepening a domain widens its rotation. The gate prints this table, so the
thinnest domain is always the one to write into next.

## Mixing a draw by level: `spec.difficultyMix`

Domain stratification says *what* an attempt asks about. It says nothing
about how tiring the attempt is, and a draw of four multi-step questions
in a row teaches less than a mixed one — the fatigue costs more than the
extra difficulty buys.

A pooled bank can declare the shape it wants:

```yaml
spec:
  examLength: 17
  difficultyMix:
    quick: 30
    core: 45
    deep: 25
```

and every question then declares where it sits:

```yaml
    - id: q23
      title: Blue/green cutover
      instance: instance-2
      domain: Application Deployment
      weight: 9
      targetSeconds: 150
      difficulty: quick
```

**A tier is a time band, not an opinion.** That is the whole point of
writing it this way: a subjective label rots, a budget does not.

| Tier | `targetSeconds` | Shape |
|---|---|---|
| `quick` | up to 240 | One object, one or two non-default fields. Not a bare `kubectl get` — the floor is still a real object with a field you have to know |
| `core` | 241-540 | The real exam's median task: a manifest with a few non-obvious fields, or two chained steps |
| `deep` | 541-840 | Multi-step, ordering matters, or diagnosis before the fix |

[exam.go](../facilitator/internal/exam/exam.go) refuses to load a bank
whose label and budget disagree, so the two cannot drift apart.

### What the draw guarantees, and what it does not

**The domain split is a hard constraint and the mix a soft one.** Each
domain takes its exact allocation and spends it on whichever tier is
furthest behind; a domain that cannot supply that tier supplies the next
best, and the shortfall carries to the following domain rather than
bending the domain split. `spec.domainWeights` is the promise the graders
weight a final score by (`evaluate.Results.Finalize`), and a comfort
preference does not get to move a score.

One consequence is worth knowing: **the tier composition of a draw does
not depend on the seed.** Only the deficit and what each domain holds
decide which tier is spent next, so every attempt of a given bank holds
the same counts — the seed decides only *which* question fills each slot.
The mix is guaranteed, not likely.

[bank-weights.sh](../tests/bank-weights.sh) replays that walk and fails
the bank when a tier lands more than one question from its share, prints
a domain-by-tier depth table, and checks the drawn attempt against the
clock: 0.85 to 1.05 of `spec.duration`, because a bank that wastes the
clock and one nobody finishes are both miscalibrated. `ckad-mock-01`
currently draws 5 quick, 8 core and 4 deep for 115 minutes of task time
against 120.

The tier never reaches the candidate **mid-attempt**: a question labelled
`deep` on screen would only tell someone to brace. It arrives once the
attempt is over, on `GET /api/results`, where the same score is also cut
by level — see [api.md](api.md). That cut is the reason the axis is worth
having beyond comfort: a score that holds up on short tasks and falls
away on long ones is a pacing problem, and a flat low score is a
knowledge problem, and the two want different practice.

### Points in a pooled bank

Derive them against the **pool**, exactly as an unpooled bank does:
`domain budget / questions in that domain`, counting every authored
question. `ckad-mock-01`'s 44 questions total 360 points that way — flat per
domain, 9 or 7 — and every domain's share of them lands within one
percentage point of its curriculum weight.

The flat split is a convention about the **domain budget**, not a rule
about per-question uniformity, and a pooled bank may vary its questions'
weights by tier within a domain so long as the domain totals land.
`cka-mock-01` does this deliberately — deep questions outweigh core,
core outweigh quick, the way the real CKA's task weights are non-uniform
— because a flat split is arithmetically impossible for its five domains
at its question counts, and the pooled-bank gates check domain totals
and pool depth, not per-question uniformity
([the bank's design rationale](cka-track-plan.md#question-pool--26-questions)).

What that does *not* give you is a drawn attempt whose raw points divide
in the curriculum's ratios, and it cannot: a domain that contributes 4 of
its 10 questions to the draw contributes 4/10 of its pool points with it.
Two other things keep the promise instead, which is why
[bank-weights.sh](../tests/bank-weights.sh) checks pool DEPTH here rather
than point share:

- **the draw is stratified by count**, so every attempt holds each
  domain's published share of the *questions* — which is the candidate's
  effort;
- **the graders weight the final score by `spec.domainWeights`**
  (`evaluate.Results.Finalize`) whether or not the points agree, because
  a subset of a bank cannot inherit a promise the whole bank makes.

## Points and domain weights

A domain's share of a bank's points is its curriculum weight. Points are a
property of the domain, not of the question:

```
question points = domain budget / questions in that domain
check points    = split the question's total by how much each check matters
```

Derive points rather than assigning them. Assigned points rot — every question
added to a finished bank shifts the balance and nothing notices — while a
derived seventh question in a domain makes all seven worth slightly less,
automatically.

Two consequences follow. Questions in different domains are worth different
amounts, and the question list shows the number, so it is honest signalling
rather than a hidden thumb on the scale. Do not flatten a question into equal
parts to hit its total; the behavioural check is usually worth more than the
structural ones that set it up.

[bank-weights.sh](../tests/bank-weights.sh) asserts, per bank:

| # | Assertion | Line |
|---|---|---|
| 1 | The questions in `exam.yaml` and the `q*/` directories on disk are the same set | `:229` |
| 2 | Every question has at least one `validate.d/*.sh` | `:237` |
| 3 | Every check carries a `# points: N` header matching the grader's pattern exactly | `:241` |
| 4 | A question's `weight:` equals the sum of its checks' points | `:246` |
| 5 | Every question's domain has a `spec.domainWeights` entry | `:275` |
| 6 | Every `spec.domainWeights` entry is used by at least one question | `:277` |
| 7 | Each domain's share is within 2 percentage points of its target | `:341` |

A bank with no `spec.domainWeights` skips 5 through 7 and is still subject to
1 through 4. That is how `smoke-01`, the hidden switch-test fixture mapped to
no curriculum, stays green.

## Question directory: `banks/<bank-id>/<qid>/`

| File | Purpose |
|---|---|
| `question.md` | Statement shown to the candidate. Name the instance and any artifact paths (`/opt/course/<n>/...`) |
| `setup.sh` | Seeds cluster pre-state. Runs inside `k8s-env` as root with the admin `KUBECONFIG` |
| `files/` | Optional. Copied into `/opt/course/<n>/` on every instance at start, owned by `candidate` |
| `expected/` | Optional. Documents a failed check shows beside the candidate's cluster state, read by `show_expected` — see [the artifact protocol](#showing-your-work-the-artifact-protocol). Generated from the reference solution, never hand-written |
| `hints.md` | Optional two-tier hints, shown in Training mode |
| `validate.d/NN_name.sh` | One scoring criterion each, run in lexical order |
| `solution.md` | Full walkthrough, shown after the exam |

A hands-on question with no `validate.d/*.sh` is a hard load error
([exam.go](../facilitator/internal/exam/exam.go)) as well as a
weights-gate failure.

`files/` is how a question hands the candidate starting material — a Dockerfile
to edit, a manifest on a removed apiVersion, a kustomize base. It cannot come
from `setup.sh`, which runs on `k8s-env` and has no access to the per-instance
`/opt/course` volumes.

- The copy creates only files that are **absent**, never overwriting.
  The seeded file *is* the answer sheet, and re-copying would discard
  the candidate's edits across a `./sim down && ./sim up`.
- A reset clears `/opt/course` first and seeds fresh copies. A restart
  does not.

> **Do not ship anything under `files/` that a check reads without the
> candidate having modified it.** That scores whether the copy worked,
> not whether they did anything.

## Multiple-choice banks (examType: mcq)

An mcq bank is `exam.yaml` plus, per question, a stem and an
explanation. No cluster is involved anywhere:

- Nothing to seed, nothing to ssh into.
- Grading is a set comparison inside the facilitator
  ([mcqgrade](../facilitator/internal/mcqgrade/mcqgrade.go)) against the
  selections the session stored.
- An mcq attempt therefore starts before the environment finishes
  booting, and the exam screen works on a phone.

```yaml
spec:
  examType: mcq
  duration: 90m
  speedDuration: 45m
  passingScore: 75
  domainWeights:
    Kubernetes Fundamentals: 44
    Container Orchestration: 28
    Cloud Native Application Delivery: 16
    Cloud Native Architecture: 12
  questions:
    - id: q01
      domain: Kubernetes Fundamentals
      multi: false
      options:
        - "The kubelet"
        - "The kube-scheduler"
        - "The kube-apiserver"
        - "etcd"
      correct: [2]
```

Differences from the hands-on shape:

- **No `spec.instances`.** Declaring any marks the bank unavailable
  ([catalog.go](../conductor/internal/catalog/catalog.go)) — nothing
  would ever ssh to them.
- **Question keys are `id / domain / (weight) / multi / options /
  correct`**, in that order, one per line (with `docs:` after `correct:`
  if the question has one) — [bank-mcq.sh](../tests/bank-mcq.sh) parses
  the block with a regex kept honest by the same directory cross-check
  bank-weights.sh uses.
- **`weight` is optional and defaults to 1**, matching the real exam's
  uniform scoring. Domain balance is then question-count share.
- **`options`** is 3-6 single-line quoted strings (inline markdown such
  as backticks is fine; block scalars are rejected by the gate).
- **`correct`** holds sorted 0-based indices into `options`. A
  `multi: false` question has exactly one; a `multi: true` question has
  at least two and never all of them. The key stays server-side: it is
  never served with the question, only inside graded results.
- **Scoring is all-or-nothing per question**: the selected set must
  equal the correct set. A `multi: true` stem should end with
  "Choose all that apply." so the candidate knows the rules.
- **The question directory holds `question.md` and `solution.md`
  only** — no `setup.sh`, `validate.d/` or `files/` (the gate enforces
  their absence). `question.md` is the stem alone; the options render
  from exam.yaml, so never enumerate them in the stem. `solution.md` is
  the explanation shown in review: why the correct answer is correct,
  then a "Why the others are wrong" bullet per distractor, bolding each
  option's text verbatim. `hints.md` works as for hands-on banks and is
  optional.
- **`./sim grade` refuses mcq banks** — the answers live in the
  session, not the cluster. Grade through the UI or the API.

[bank-mcq.sh](../tests/bank-mcq.sh) asserts, per mcq bank:

1. The id set matches the directories on disk.
2. Every stem and explanation exists, the explanation above a length
   floor.
3. Option and correct-index arity, as above.
4. MCQ purity — no `setup.sh`, no `validate.d/`, no `files/`.
5. `domainWeights` sums to 100, with bidirectional domain coverage.
6. No single option position is correct on more than half the
   single-answer questions. A degenerate key reads like a pattern.

The weight-versus-content check has **two modes**:

| Condition | Rule |
|---|---|
| No `examLength`, or one that does not shrink the pool | Each domain's share of the pool's own points must sit within 2 percentage points of its target. The pool **is** the exam |
| A smaller `examLength` | Each domain's *pool* must be at least as deep as the per-domain count a stratified draw of that size needs. The pool's own ratio is free to differ, since every draw is stratified to the target regardless |

[bank-weights.sh](../tests/bank-weights.sh) applies the same two modes
to a hands-on bank.

One trade-off to know when editing a shipped bank: answers are stored
by option index, so reordering or editing `options` mid-attempt
silently changes what a stored selection means. Reset the session after
editing an mcq bank's options.

## Code blocks in question.md and solution.md

**Use fenced blocks, never 4-space indentation.** The UI's highlighter
reads a fence's language tag and nothing else, so an indented block
always renders as plain text.

| Tag | For |
|---|---|
| `bash` (aliases `sh`, `shell`) | Shell commands |
| `yaml` | Manifests |
| `json` | JSON payloads |
| Anything else, or untagged | Renders plain |

- Leaving a block untagged costs nothing. Guessing a tag shows the wrong
  colour on a study tool.
- A heredoc wrapping a manifest (`k apply -f - <<'EOF'` … `EOF`) is a
  `bash` block — it is one command the candidate copies and runs whole.

## Validate script contract

- Runs on the question's `instance`, as root, with
  `KUBECONFIG=/home/candidate/.kube/config` and `BANK=<bank-id>`. `BANK` lets a
  check read its own bank's pristine `files/` under `/banks/$BANK/<qid>/files`
  to prove a reference file was left alone.
- Carries the header comments the grader parses: `# points: <int>` and
  `# desc: <one line>`.
- Sources `/banks/_lib/checks.sh` and uses its helpers.
- Exit 0 = criterion met, non-zero = failed, stdout = short message, optionally
  followed by an [artifact trailer](#showing-your-work-the-artifact-protocol).
- Never mutates the cluster or the filesystem.
- Reads the cluster API, never a node's disk. `tests/check-lint.sh` fails a
  check containing a bare `ssh` or `scp` for that reason: a login spends most
  of the budget the check is meant to be grading in, and a machine's disk is
  not what the cluster believes. One carve-out exists — whether an etcd
  snapshot **file** is a real snapshot is a question no API answers
  ([q26](../banks/cka-mock-01/q26/validate.d/10_snapshot.sh)). It is marked
  per line with `# lint: allow-node-read`, and every marked line is listed at
  the end of a lint run so the set stays small enough to read. A question that
  wants node state for anything else should put the artifact somewhere the API
  or the instance can see instead.
- Finishes within 30 seconds. The facilitator kills a check that passes its 30s
  deadline and scores it failed with "check timed out".

### Showing your work: the artifact protocol

A failed check that says only *that* the candidate was wrong makes them go and
look. The explanation screen wants the looking done for them: **YOUR CLUSTER
STATE** beside **EXPECTED**, and a sentence on why the two differ. A check
supplies those by appending a trailer to its own stdout.

```
selector is 'app=inventory-api', want app=inventory
---8<--- sim:artifact actual yaml
apiVersion: v1
kind: Service
spec:
  selector:
    app: inventory-api
---8<--- sim:artifact why text
A Service finds its Pods by label, never by name. While spec.selector
matches no Pod, the Service has no endpoints at all.
```

Everything before the first sentinel line is the message, unchanged. Each
sentinel opens a body running to the next sentinel or to EOF. Emit them with
the [\_lib/checks.sh](../banks/_lib/checks.sh) helpers rather than by hand.

A check that pairs a generated document (see
[Expected documents](#expected-documents) below) calls `show_pair`, which
emits both the actual and expected panes from one `snapshot()`:

```bash
snapshot() {
  printf '%s' "${spec:-null}" \
    | jq -S '{ports: (.ports // null), readinessProbe: (.readinessProbe // null)}' 2>/dev/null
}

evidence() {
  show_pair json probe.json
  show_why "$1"
}

[ "$kind" = httpGet ] && [ "$path" = "/" ] || {
  echo "the readinessProbe is a '$kind' probe on path '$path', want an httpGet on /"
  evidence "The question asks for this probe to be repaired rather than replaced, and only its port was ever wrong. A tcpSocket probe passes as soon as the port accepts a connection, which says nothing about whether the application can serve a request, and an exec probe grades something else entirely — so swapping the probe's type is not a repair, and this check scores nothing for it."
  exit 1
}
```

A check with nothing to pair calls `show_actual` directly instead, exactly
as it always has:

```bash
evidence() {
  show_actual text "$(printf '%s\n\n%s\n' \
    "$(kubectl -n "$ns" get pod -l app=telemetry-api 2>/dev/null)" \
    "Available=${avail:-<none>} ${reason:-}")"
  show_why "$1"
}
```

Call them **after** the failure message and **before** `exit 1`.

Every check in `ckad-mock-01` and `cka-mock-01` emits at least a
`show_why`, so the banks themselves are the reference.
[`cka-mock-01/q01`](../banks/cka-mock-01/q01/validate.d) is worth reading
first — it is the worked example the rest of this section is built from:
[20\_probe.sh](../banks/cka-mock-01/q01/validate.d/20_probe.sh) shows the
full `evidence()` shape above, with a `jq` fragment captured instead of a
whole object, and
[30\_ready.sh](../banks/cka-mock-01/q01/validate.d/30_ready.sh) shows the
same shape for a check that opts out of a document entirely.

Prefer a `jq` projection to a whole object where the check is about a few
fields. It sidesteps the server-side noise entirely, and the pane then
shows what the check is about rather than everything that happens to sit
near it.

The rules the grader
([evaluate/artifact.go](../facilitator/internal/evaluate/artifact.go)) applies:

| | |
|---|---|
| `kind` | Exactly `actual`, `expected` or `why`. A closed set: each names a region of the explanation screen, and a fourth value would arrive at a client with nowhere to put it |
| `lang` | Required in the sentinel, a highlighter tag (`yaml`, `json`, `text`), 1-16 characters of `[A-Za-z0-9_+-]` |
| Column 0 | The sentinel is recognised only at the start of a line. This is also the escape hatch: a check whose real output must contain that string indents it one space |
| A malformed sentinel | Discards **that block only** and parses on. Never fails the check — the candidate is mid-exam and a bank bug must not cost them points. The message still ends at the first sentinel-prefixed line, so a typo degrades to "no evidence" rather than pasting a Deployment into a one-line message. `tests/check-lint.sh` is where an author is meant to find out |
| A check that passed | Loses its artifacts entirely. A correct answer has nothing to explain, and results are persisted in the session file and served back on every `/api/results` |
| Size | 8 KiB per artifact, 24 KiB per check, 8 artifacts per check. Over any of them the body is cut and a `[truncated by the grader: …]` line is appended — visibly, never silently |
| A check that emits none | Produces a **byte-identical** message to one written before the protocol existed. All 75 shipped CKAD checks rely on this and none was edited for it (`evaluate/artifact_test.go`) |

Collision is vanishingly unlikely rather than impossible. `---8<---` is the
conventional cut-here scissors and nothing `kubectl`, `jq` or `yq` emits, and
YAML indents block-scalar content so an embedded copy is never at column 0 —
but a check that `cat`s a file quoting this page could produce one, and the
one-space indent is the answer.

#### Expected documents

Every check declares, beside its `# points:`/`# desc:` headers, whether it
pairs a generated document. Paired:

```
# expected: probe.json json
```

Opted out, with the reason inline — the reason can wrap across
continuation comment lines:

```
# expected: none — the check grades whether the Deployment reached its replica
#           count, which is a reading taken at a moment rather than a document
#           the candidate authored. The message already names the count.
```

[check-expected.sh](../tests/check-expected.sh) requires exactly one
`# expected:` line per check and enforces everything below.

**Pairing.** A paired check declares an unconditional, top-level
`snapshot()` — the exact projection the check already builds for its
evidence pane, lifted out and given a name — and calls `show_pair <lang>
<name>` from `evidence()` in place of the old `show_actual` call:

```bash
snapshot() {
  printf '%s' "${spec:-null}" \
    | jq -S '{ports: (.ports // null), readinessProbe: (.readinessProbe // null)}' 2>/dev/null
}

evidence() {
  show_pair json probe.json
  show_why "$1"
}
```

`show_pair` ([\_lib/checks.sh](../banks/_lib/checks.sh)) emits both panes
from one pipeline: the actual side from `snapshot()`'s own output, and the
expected side from the generated document at `<qid>/expected/<name>`,
located through `expected_dir()` — derived from the check's own path,
never a hardcoded bank id or qid. One function feeding both panes is also
what makes "filter both panes identically" stop being something an author
has to remember and turns it into the only way to write it.

An opted-out check declares no `snapshot()` and calls no `show_pair`.
`evidence()` keeps calling `show_actual` directly, exactly as it always
has:

```bash
evidence() {
  show_actual text "$(printf '%s\n\n%s\n' \
    "$(kubectl -n "$ns" get pod -l app=telemetry-api 2>/dev/null)" \
    "Available=${avail:-<none>} ${reason:-}")"
  show_why "$1"
}
```

**When to pair**, the whole rule in one line:

> Pair when the check grades a shape the candidate authored. Opt out when
> it grades an event, a measurement, or a relationship between two live
> values.

Sampled across the 212 checks in both banks, by the pane the check
already shows:

| Pane the check shows | Checks | Pairs? |
|---|---|---|
| a `jq`/`yq` projection (`show_actual json` or `yaml`) | 126 | yes |
| the content of a file the candidate wrote (`cat`, `file_text`) | 21 | yes, as text |
| a `kubectl get` table, a name list, a count, or a "ready / reachable / complete" reading | 65 | mostly no |

A check can carry two criteria of different taxonomy without splitting its
pane:
[q01/10\_image.sh](../banks/cka-mock-01/q01/validate.d/10_image.sh) grades
both the authored image field and a behavioural "did a Pod start"
reading, and pairs only the image half. The UI shows exactly one
actual/expected pair per check, not per criterion, so the behavioural
criterion's outcome rides on its own `crit` message and `show_why` text
instead of getting a second pane.

**Two projection rules**, whether or not the check pairs:

1. Only what this check grades. Not the whole object. A whole-object pane
   marks a legitimately different but ungraded field as if it were
   wrong.
2. Sort what has no meaningful order. `jq -S` for key order, and sort any
   scalar array whose order carries no meaning — an RBAC Role's `verbs:
   ["get","list"]` and `verbs: ["list","get"]` are the same Role and must
   never render as a difference. `k8s_clean` already covers the
   server-assigned fields a YAML pane needs stripped: `managedFields`,
   `status`, `resourceVersion`, `uid`, `generation`, `creationTimestamp`,
   and the `last-applied-configuration` annotation. Anything else the
   question is not about is the check's own `yq`/`jq` filter to remove.

**Documents are never hand-written.** The only way one is created:

```bash
bash tests/drill.sh --capture <bank>
```

It runs the check's own `snapshot()` against a cluster the grader just
scored at full marks — never against an unsolved or hand-edited one. A
hand-written "expected" drifts from what the reference solution actually
produces the moment either side changes, and then teaches the candidate
something false.

A check with no document must say why, in the file — not just silently
have nothing. **Prefer declaring to inventing.**
[q19/20\_reachable.sh](../banks/ckad-mock-01/q19/validate.d/20_reachable.sh)
is the model for how to reason a `none` out: it grades whether a Service
has ready endpoints and really answers a request, and an EndpointSlice is
written by a controller, with a random name suffix and Pod IPs for
addresses, so an authored "expected" one would only teach a candidate to
look for numbers that were never going to be theirs. (That file does not
carry its own `# expected: none` header yet — a later pass converts every
remaining check — but its reasoning is the pattern to follow.)

### Grade behaviour, not spelling

**A check that fails a correct answer is worse than no check at all.** It
teaches the candidate something false about Kubernetes and costs them points
they earned, invisibly — they see a red row, not a linting complaint.

Read the live API object (`-o jsonpath`, or `-o json | jq`), never the manifest
as text. The API server normalises field order, indentation and quoting before
a check sees anything, so `limits` before `requests` is byte-identical to the
reverse.

[banks/\_lib/checks.sh](../banks/_lib/checks.sh) carries the normalisers —
quantities by value, octal modes against the decimal the API stores,
human-typed files without their CRLF, sets compared as sets — and its header
lists them with the rule each encodes. Source it as the first line after `set`:

```bash
set -uo pipefail
. /banks/_lib/checks.sh
```

### check-lint rules

[check-lint.sh](../tests/check-lint.sh) lints every
`banks/*/q*/validate.d/*.sh`.

| Rule | Severity | Trigger |
|---|---|---|
| `points` | error | No `# points:` header at all, or one that is not exactly `# points: N` — one space, no leading zeros |
| `diff` | error | `diff`, which makes line order part of the answer |
| `grep-yaml` | error | `grep` against a `.yaml`/`.yml` path |
| `get-yaml` | error | `kubectl ... -o yaml` |
| `kubectl-run` | error | `kubectl ... run` |
| `grep-qx` | error | `grep -qx`, which fails on a trailing space or a CRLF |
| `unsourced-helper` | error | Calls a `_lib/checks.sh` helper without sourcing the library or defining the function locally |
| `artifact-sentinel` | error | A hand-written `---8<--- sim:artifact` line that is not exactly `<kind> <lang>` with one space between fields |
| `artifact-call` | error | `show_actual`/`show_expected` without a literal lang then a body, or `show_why` with no note |
| `index` | warning | A fixed `[0]` index |

Opt a line out with `# lint: allow-<rule>` where the pattern is genuinely
correct. Every rule above honours it except `points` and `unsourced-helper`,
which have no escape hatch, and comment lines are never linted.

The two `artifact-*` rules exist because the protocol degrades silently by
design: a malformed sentinel costs the candidate nothing at grade time, which
also means the author gets no signal that their evidence never arrived.
Offline is the only place it can be noticed.

`get-yaml` has one structural exemption rather than an escape hatch: a
`-o yaml` piped straight into `k8s_clean` and handed to
`show_actual`/`show_expected` **on the same line**.

- Scoring on a serialisation grades spelling. Showing one is the
  opposite errand, and there is no other way to produce a whole document
  for the pane.
- Capture the same pipeline into a variable and the rule fires again,
  because there is then something to compare it to.

`diff` gets no such exemption, and the artifact protocol is not a
loophole in it.

**A grader emits what it found and what it wanted. It never emits a
diff.**

- The explanation screen's side-by-side is *rendered* client-side from
  the `actual` and `expected` documents, after grading, where being
  wrong costs nothing.
- The ban is on `diff` deciding a *score*. Line order and whitespace are
  not the candidate's answer, and a check scoring them fails correct
  work.

## What the cluster provides

| Guarantee | Installed by |
|---|---|
| NetworkPolicy is enforced — the CNI is Calico, not kind's kindnet | [images/k8s-env/bootstrap.sh](../images/k8s-env/bootstrap.sh), before any `setup.sh` |
| An ingress controller: ingress-nginx, IngressClass `nginx`, pinned to the control-plane node | [images/k8s-env/bootstrap.sh](../images/k8s-env/bootstrap.sh), before any `setup.sh` |
| A Helm repo named `sim`, serving [banks/\_charts/](../banks/_charts) from `k8s-env:8879` | Served by [images/k8s-env/start.sh](../images/k8s-env/start.sh) before bootstrap runs, and repackaged only when it has to be: one SHA-256 over the chart sources, the repo URL and the `helm` binary is stamped inside the published directory, so a restart that still matches it reuses the repo and runs no `helm package` at all. Each instance adds it in [images/instance/entrypoint.sh](../images/instance/entrypoint.sh) |
| A registry at `registry:5000` — plain HTTP, no auth | A compose service ([docker-compose.yaml](../docker-compose.yaml)) |

- **Calico** is the difference between a policy question that can only
  check the shape of a candidate's YAML and one that can check what the
  policy does. Prefer behavioural checks.
- **`helm`** is available to `setup.sh` too, so a question can seed
  releases — including one deliberately left in a bad state.
- **The registry** sits on `examnet` alongside `k8s-env`, the desktop,
  the facilitator, the docs proxy and both instances. Podman is
  installed only on the instances, so in practice only they build, tag
  and push to it.

### Testing: in-cluster first

A question must be solvable and verifiable from inside the cluster. That is
what the real exam expects, and the instances are not cluster nodes, so a
ClusterIP is unreachable from an instance shell. `kubectl run` is where that
rule splits in two, and the halves are opposites:

| Context | `kubectl run` |
|---|---|
| The candidate at a shell, and `solution.md` | The idiom: `kubectl -n <ns> run tmp --rm -it --restart=Never --image=nginx:alpine -- curl -m 5 <svc>` |
| `validate.d/*.sh` | **Forbidden.** [check-lint.sh](../tests/check-lint.sh) fails the build on it as a hard `kubectl-run` error |

A check has 30 seconds. Scheduling a Pod, pulling its image, running the
command and tearing it down uses most of that.

The check then passes on an idle cluster and times out on a busy one —
and a timed-out check is scored failed, taking points off a correct
answer.

Make the request from a workload the question already runs:

```bash
# the allowed path must work, and the denied one must time out
kubectl -n "$NS" exec deploy/frontend -- wget -q -T 4 -O /dev/null http://api:80
kubectl -n "$NS" exec deploy/metrics -- wget -q -T 4 -O /dev/null http://api:80 && exit 1
```

`exec` costs about a second, mutates nothing, and crosses the same DNS,
kube-proxy, Service selector and targetPort. A question with no running
workload to exec into probably needs one in `setup.sh` anyway, so the candidate
has something to test against too.

Ports are also mapped out to the host — `:8081` ingress HTTP, `:8443` ingress
HTTPS, `:30080-30082` NodePorts — so a candidate can open their own Ingress in a
browser while learning. No `validate.d` check may depend on that path: it is
outside the cluster, and which interface it answers on is the candidate's to
change with `SIM_BIND` ([SECURITY.md](../SECURITY.md)) — grading must not vary
with either.

## Runtime environment provided to scripts

- `/shared/kubeconfig` — admin kubeconfig, server `https://k8s-env:6443`.
- Instances: user `candidate` (password `candidate`, passwordless `sudo`),
  kubeconfig at `~/.kube/config`, writable `/opt/course/`, and kubectl, helm,
  yq, jq, vim, nano and podman.
- `/opt/course/<n>` is pre-created on every instance for each question, where
  `<n>` is the digits of the question id (`q01` → `/opt/course/1`), owned by
  `candidate`. Never require a candidate to create these directories; they only
  write files into them, as on the real exam.
- `/banks` mounted read-only on `k8s-env` and both instances.

## Hints: `banks/<bank-id>/<qid>/hints.md`

Hints are all-or-nothing per bank. [bank-hints.sh](../tests/bank-hints.sh)
fails a bank where some questions have `hints.md` and others do not; a bank
with none at all is valid, and the tray does not appear.

One file per question, `## Hint N` headings, tiers numbered from 1. Text before
the first heading is ignored, so leave an author's note there if you want one.
Bodies render through the Markdown component the question uses, so fenced
blocks get their copy buttons.

```markdown
## Hint 1

Which field decides this? `kubectl explain` knows.

## Hint 2

`spec.selector` on the Service against `--show-labels` on the Pods.
```

The rest of what the gate enforces:

- Exactly two tiers, numbered 1 and 2, neither empty.
- A hint is not the solution. A tier sharing 120 or more consecutive characters
  with `solution.md` fails the build, because a hint a candidate can paste
  removes the exercise while looking like help.
- Tier 1 points at the concept; tier 2 names the exact resource, field or flag
  without writing the answer out.

Hints are served one tier at a time by `GET /api/questions/{id}/hints/{n}`,
gated on the attempt being in Training mode.

## Exam tips: `banks/<bank-id>/tips.md`

One optional file beside `exam.yaml`, for the whole bank rather than per
question: how to sit **this** exam quickly. Typical contents:

- Aliases and shell completion.
- The generators that write a manifest so nobody types one.
- `explain` and `-h` before the documentation.
- Editor settings for YAML.
- What to look at when a Pod will not start.
- When to give up on a question and move on.

It is bank data, not UI copy, on the same reasoning that governs
`spec.environment.nodes`: what makes a CKAD attempt fast is not what
makes a CKA one fast — the CKA bank's page is mostly about its
ssh-per-task host model, which no other bank has — and a panel of
strings in the client would have to claim one of them was the other.
CKAD, CKA and KCNA each ship one today; CKS will ship its own.

- **Served ungated** by `GET /api/exam/tips` as `{"markdown": "…"}` —
  unlike solutions and hints, which check the attempt's mode first.
  Technique is not answers: the same advice is true before, during and
  after an attempt, and it is most useful before one.
- **Read per request**, like `question.md` and `solution.md`, so editing
  it needs no facilitator restart. Only its existence is loaded at boot,
  and it reaches the client as `hasTips` on `GET /api/exam`.
- **A bank with no `tips.md` draws no control at all.** An empty file
  counts as none, for the same reason — a control that opens an empty
  sheet is worse than no control.
- Rendered through the same Markdown component the questions use, so
  fenced blocks get their copy buttons and inline backticks become
  copyable values. Write commands as commands: the point of the page is
  that nobody retypes them under a clock.
- No gate script. There is nothing to cross-check — no ids, no points and
  no answer key — and a length floor would only encourage padding.

## Attempt modes

Every bank runs in three. Exam uses `spec.duration`, `speed` (labelled
Mastery in the UI) uses `spec.speedDuration`, and Training has no clock at
all — which is also the project's answer to WCAG 2.2.1 Timing Adjustable.

## Conventions nothing enforces

Real requirements with no gate behind them. Breaking one ships a broken bank
that every test passes.

- `setup.sh` re-runs on every reset and bank switch, so write it idempotent.
- `question.md` is the task body ONLY. It must not open with a
  `# Question N | Title` heading or repeat the instance in prose: the task
  pane renders both from structured data — the title from
  `spec.questions[].title`, the instance from `spec.questions[].instance`
  as a chip and as the WORK FROM block — so a bank that also writes them
  draws the title twice and the ssh host three times. Naming the instance
  in prose is also an un-gated way to disagree with
  `spec.questions[].instance`, which is the field that actually decides
  where a check runs.
- Checks must be side-effect free. `check-lint` catches the known brittle
  idioms, not mutation.
- `# desc:` is parsed ([exam.go](../facilitator/internal/exam/exam.go))
  and never validated, so a missing one ships an empty description to the score
  screen in silence.
- `spec.instances` feeds only the exam selector's availability flag;
  `spec.questions[].instance` is what decides where a check actually runs.
