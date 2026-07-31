# Question bank specification (v1alpha2)

A bank lives at `banks/<bank-id>/` and holds `exam.yaml` plus one directory
per question. The conductor scans every `banks/*/exam.yaml` into the catalog
the lobby renders; [banks/catalog.yaml](../banks/catalog.yaml) adds
coming-soon entries whose exam engine does not exist yet.

Five gates decide whether a bank ships —
[bank-weights.sh](../tests/bank-weights.sh),
[check-lint.sh](../tests/check-lint.sh),
[check-lib.sh](../tests/check-lib.sh) and
[bank-hints.sh](../tests/bank-hints.sh) for hands-on banks, and
[bank-mcq.sh](../tests/bank-mcq.sh) for multiple-choice ones. All are
offline and run at the top of [tests/smoke.sh](../tests/smoke.sh), so a
bank mistake fails in seconds rather than forty minutes into a cold boot.

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
comments. [bank-weights.sh](../tests/bank-weights.sh) parses the block with a
regex, not a YAML library, so a reordered key or a trailing comment hides a
question from the gate — which then fails the bank for disagreeing with the
directory listing.

| Field | Meaning and status |
|---|---|
| `metadata.name` | Bank id. Convention: the conductor rejects a mismatch with the directory name only when the field is non-empty ([catalog.go:159](../conductor/internal/catalog/catalog.go)) |
| `metadata.title`, `.certification`, `.description` | Lobby card title, badge (`CKAD`/`CKA`/`CKS`) and one-line blurb |
| `metadata.hidden` | Keeps the bank out of the lobby while leaving it a legal `switch` target. Exists for `smoke-01`; a bank worth shipping is worth listing |
| `spec.examType` | `hands-on` (the default when absent, [catalog.go:164-166](../conductor/internal/catalog/catalog.go)) or `mcq`; any other value lists the bank disabled with a "no engine yet" note |
| `spec.duration` | The Exam clock. Enforced: the facilitator ends the session at 0:00 |
| `spec.speedDuration` | The Speed clock, defaulting to half `spec.duration` ([exam.go:105-110](../facilitator/internal/exam/exam.go)). A malformed value fails the load |
| `spec.passingScore` | Percent. Enforced by the facilitator's `Results.Passed` |
| `spec.kubernetesVersion` | Informational; shown on the catalog card |
| `spec.domainWeights` | The certification's published weights. Read by no Go code — only by [bank-weights.sh](../tests/bank-weights.sh) |
| `spec.environment.provider`, `.nodes` | Informational; read by nothing |
| `spec.environment.allowedDomains` | Domain suffixes the desktop browser may reach through the docs proxy, subdomains included ([proxy/entrypoint.sh](../proxy/entrypoint.sh)). Omit it to inherit `allow.DefaultDomains` ([allow.go](../proxy/internal/allow/allow.go)), the smallest set that leaves the documentation sites usable |
| `spec.instances` | 1 or 2 entries. Convention: names outside `instance-1`/`instance-2` only mark the bank unavailable in the lobby ([catalog.go:199-210](../conductor/internal/catalog/catalog.go)), and the facilitator's exam loader never parses the block at all |
| `spec.questions[].id`, `.instance` | Question directory name, and the ssh host the grader runs its checks on |
| `spec.questions[].domain` | Must match a `domainWeights` key |
| `spec.questions[].weight` | Must equal the sum of this question's `# points:` headers |

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
| 1 | The questions in `exam.yaml` and the `q*/` directories on disk are the same set | `:87` |
| 2 | Every question has at least one `validate.d/*.sh` | `:106` |
| 3 | Every check carries a `# points: N` header matching the grader's pattern exactly | `:110` |
| 4 | A question's `weight:` equals the sum of its checks' points | `:114` |
| 5 | Every question's domain has a `spec.domainWeights` entry | `:133` |
| 6 | Every `spec.domainWeights` entry is used by at least one question | `:135` |
| 7 | Each domain's share is within 2 percentage points of its target | `:146` |

A bank with no `spec.domainWeights` skips 5 through 7 and is still subject to
1 through 4. That is how `smoke-01`, the hidden switch-test fixture mapped to
no curriculum, stays green.

## Question directory: `banks/<bank-id>/<qid>/`

| File | Purpose |
|---|---|
| `question.md` | Statement shown to the candidate. Name the instance and any artifact paths (`/opt/course/<n>/...`) |
| `setup.sh` | Seeds cluster pre-state. Runs inside `k8s-env` as root with the admin `KUBECONFIG` |
| `files/` | Optional. Copied into `/opt/course/<n>/` on every instance at start, owned by `candidate` |
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

The copy creates only files that are absent, never overwriting, because the
seeded file *is* the answer sheet and re-copying would discard the candidate's
edits across a `./sim down && ./sim up`. A reset clears `/opt/course` first and
seeds fresh copies; a restart does not. Do not ship anything under `files/`
that a check reads without the candidate having modified it — that scores
whether the copy worked, not whether they did anything.

## Multiple-choice banks (examType: mcq)

An mcq bank is exam.yaml plus, per question, a stem and an explanation.
No cluster is involved anywhere: nothing to seed, nothing to ssh into,
grading is a set comparison inside the facilitator
([mcqgrade](../facilitator/internal/mcqgrade/mcqgrade.go)) against the
selections the session stored. That is also why an mcq attempt starts
before the environment finishes booting, and why the exam screen works
on a phone.

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
  correct`**, in that order, one per line —
  [bank-mcq.sh](../tests/bank-mcq.sh) parses the block with a regex kept
  honest by the same directory cross-check bank-weights.sh uses.
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

[bank-mcq.sh](../tests/bank-mcq.sh) asserts, per mcq bank: the id set
matches the directories on disk; every stem and explanation exists (the
explanation with a length floor); option and correct-index arity as
above; mcq purity; `domainWeights` sums to 100 with bidirectional
domain coverage; each domain's share within 2 percentage points of its
target; and that no single option position is correct on more than half
of the single-answer questions — a degenerate key reads like a pattern.

One trade-off to know when editing a shipped bank: answers are stored
by option index, so reordering or editing `options` mid-attempt
silently changes what a stored selection means. Reset the session after
editing an mcq bank's options.

## Code blocks in question.md and solution.md

Use fenced blocks, never 4-space indentation. The UI's highlighter reads a
fence's language tag and nothing else, so an indented block always renders as
plain text. Tag each fence with what the content is: `bash` for shell commands,
`yaml` for manifests, `json` for JSON payloads; `sh` and `shell` alias to
`bash`. Anything else, including an unrecognised tag, renders plain, so leaving
a block untagged costs nothing while guessing a tag shows the wrong colour on a
study tool. A heredoc wrapping a manifest (`k apply -f - <<'EOF'` … `EOF`) is a
`bash` block: it is one command the candidate copies and runs whole.

## Validate script contract

- Runs on the question's `instance`, as root, with
  `KUBECONFIG=/home/candidate/.kube/config` and `BANK=<bank-id>`. `BANK` lets a
  check read its own bank's pristine `files/` under `/banks/$BANK/<qid>/files`
  to prove a reference file was left alone.
- Carries the header comments the grader parses: `# points: <int>` and
  `# desc: <one line>`.
- Sources `/banks/_lib/checks.sh` and uses its helpers.
- Exit 0 = criterion met, non-zero = failed, stdout = short message.
- Never mutates the cluster or the filesystem.
- Finishes within 30 seconds. The facilitator kills a check that passes its 30s
  deadline and scores it failed with "check timed out".

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
| `index` | warning | A fixed `[0]` index |

Opt a line out with `# lint: allow-<rule>` where the pattern is genuinely
correct. Every rule above honours it except `points` and `unsourced-helper`,
which have no escape hatch, and comment lines are never linted.

## What the cluster provides

| Guarantee | Installed by |
|---|---|
| NetworkPolicy is enforced — the CNI is Calico, not kind's kindnet | [images/k8s-env/bootstrap.sh](../images/k8s-env/bootstrap.sh), before any `setup.sh` |
| An ingress controller: ingress-nginx, IngressClass `nginx`, pinned to the control-plane node | [images/k8s-env/bootstrap.sh](../images/k8s-env/bootstrap.sh), before any `setup.sh` |
| A Helm repo named `sim`, serving [banks/\_charts/](../banks/_charts) from `k8s-env:8879` | Packaged and served by [images/k8s-env/start.sh](../images/k8s-env/start.sh) before bootstrap runs; each instance adds it in [images/instance/entrypoint.sh](../images/instance/entrypoint.sh) |
| A registry at `registry:5000` — plain HTTP, no auth | A compose service ([docker-compose.yaml](../docker-compose.yaml)) |

Calico is the difference between a policy question that can only check the
shape of a candidate's YAML and one that can check what the policy does, so
prefer behavioural checks. `helm` is available to `setup.sh` too, so a question
can seed releases, including one deliberately left in a bad state. The registry
sits on `examnet` alongside `k8s-env`, the desktop, the facilitator, the docs
proxy and both instances; podman is installed only on the instances, so in
practice only they build, tag and push to it.

### Testing: in-cluster first

A question must be solvable and verifiable from inside the cluster. That is
what the real exam expects, and the instances are not cluster nodes, so a
ClusterIP is unreachable from an instance shell. `kubectl run` is where that
rule splits in two, and the halves are opposites:

| Context | `kubectl run` |
|---|---|
| The candidate at a shell, and `solution.md` | The idiom: `kubectl -n <ns> run tmp --rm -it --restart=Never --image=nginx:alpine -- curl -m 5 <svc>` |
| `validate.d/*.sh` | **Forbidden.** [check-lint.sh](../tests/check-lint.sh) fails the build on it as a hard `kubectl-run` error |

A check has 30 seconds, and scheduling a Pod, pulling its image, running the
command and tearing it down uses most of that. The check then passes on an idle
cluster and times out on a busy one, and a timed-out check is scored failed —
points off a correct answer. Make the request from a workload the question
already runs:

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
outside the cluster and off under a loopback `SIM_BIND`
([SECURITY.md](../SECURITY.md)), and grading must not vary with either.

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

## Attempt modes

Every bank runs in three. Exam uses `spec.duration`, Speed uses
`spec.speedDuration`, and Training has no clock at all — which is also the
project's answer to WCAG 2.2.1 Timing Adjustable.

## Conventions nothing enforces

Real requirements with no gate behind them. Breaking one ships a broken bank
that every test passes.

- `setup.sh` re-runs on every reset and bank switch, so write it idempotent.
- `question.md` must name the instance the candidate works on. Nothing
  cross-checks it against `spec.questions[].instance`.
- Checks must be side-effect free. `check-lint` catches the known brittle
  idioms, not mutation.
- `# desc:` is parsed ([exam.go:169,192](../facilitator/internal/exam/exam.go))
  and never validated, so a missing one ships an empty description to the score
  screen in silence.
- `spec.instances` feeds only the lobby's availability flag;
  `spec.questions[].instance` is what decides where a check actually runs.
