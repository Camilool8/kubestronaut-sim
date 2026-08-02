# Question bank specification (v1alpha2)

A bank lives at `banks/<bank-id>/` and holds `exam.yaml` plus one directory
per question. The conductor scans every `banks/*/exam.yaml` into the catalog
the exam selector renders; [banks/catalog.yaml](../banks/catalog.yaml) adds
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
comments. [bank-weights.sh](../tests/bank-weights.sh) parses the block with a
regex, not a YAML library, so a reordered key or a trailing comment hides a
question from the gate — which then fails the bank for disagreeing with the
directory listing. The one optional key, `title:`, goes directly after `id:`;
both gate regexes tolerate it there and nowhere else.

| Field | Meaning and status |
|---|---|
| `metadata.name` | Bank id. Convention: the conductor rejects a mismatch with the directory name only when the field is non-empty ([catalog.go:159](../conductor/internal/catalog/catalog.go)) |
| `metadata.title`, `.certification`, `.description` | The exam card's fallback title, its heading and tinted avatar (`CKAD`/`CKA`/`CKS`), and its one-line blurb. `certification` also reaches `GET /api/exam`, where the mode screen's header reads it |
| `metadata.hidden` | Keeps the bank out of the exam selector while leaving it a legal `switch` target. Exists for `smoke-01`; a bank worth shipping is worth listing |
| `spec.examType` | `hands-on` (the default when absent, [catalog.go:164-166](../conductor/internal/catalog/catalog.go)) or `mcq`; any other value lists the bank disabled with a "no engine yet" note |
| `spec.duration` | The Exam clock. Enforced: the facilitator ends the session at 0:00 |
| `spec.speedDuration` | The clock for the `speed` mode — shown to candidates as Mastery — defaulting to half `spec.duration` ([exam.go:105-110](../facilitator/internal/exam/exam.go)). A malformed value fails the load |
| `spec.passingScore` | Percent. Enforced by the facilitator's `Results.Passed` |
| `spec.kubernetesVersion` | Informational; shown on the catalog card |
| `spec.domainWeights` | The certification's published weights, and a runtime value in three places: `exam.Load` builds `Exam.Domains` from it, `exam.Draw` stratifies a pooled or filtered draw by it, and both graders weight the final score by it. [bank-weights.sh](../tests/bank-weights.sh) still gates it too. Getting it wrong now moves real scores, not just a build check |
| `spec.environment.provider`, `.nodes` | Informational; read by nothing |
| `spec.environment.allowedDomains` | Domain suffixes the desktop browser may reach through the docs proxy, subdomains included ([proxy/entrypoint.sh](../proxy/entrypoint.sh)). Omit it to inherit `allow.DefaultDomains` ([allow.go](../proxy/internal/allow/allow.go)), the smallest set that leaves the documentation sites usable |
| `spec.instances` | 1 or 2 entries. Convention: names outside `instance-1`/`instance-2` only mark the bank unavailable in the exam selector ([catalog.go:218-230](../conductor/internal/catalog/catalog.go)), and the facilitator's exam loader never parses the block at all |
| `spec.questions[].id`, `.instance` | Question directory name, and the ssh host the grader runs its checks on |
| `spec.questions[].title` | Optional short label shown in the question navigator, the jump grid and the score review. Absent, the UI falls back to the id (hands-on) or the attempt position (mcq) |
| `spec.questions[].domain` | Must match a `domainWeights` key |
| `spec.questions[].weight` | Must equal the sum of this question's `# points:` headers |
| `spec.questions[].targetSeconds` | Optional pacing budget, in seconds, shown on the task chip. Absent, the facilitator derives one from the question's weight's share of the exam clock ([exam.go](../facilitator/internal/exam/exam.go), `TargetSeconds`) and flags it `targetDerived` on `GET /api/exam`, so a derived figure is never presented as the author's judgement — neither shipped bank sets it. It is a budget, never a limit: nothing enforces it and running over costs no points. Write it as the **last** key of the question block, after `weight:` (hands-on) or `correct:` (mcq); both gate regexes end there, and a `targetSeconds:` line above them hides the question from the gate |

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

- **`spec.examLength` (optional) pools the bank.** Author more questions
  than a single attempt should ask, set `examLength` to the smaller
  per-attempt count, and `session.Manager.StartMCQ` draws a fresh,
  random subset on every `Start` ([exam.go](../facilitator/internal/exam/exam.go),
  `DrawMCQ`) — stratified so each domain contributes exactly its
  `domainWeights` share of `examLength` (largest-remainder rounding),
  never left to chance. Absent, zero, or `>=` the pool's own size means
  no pooling: every question is served, in bank order, exactly as an
  mcq bank behaved before this field existed — the hidden `smoke-mcq`
  fixture and any bank that has not opted in take this path. The drawn
  subset is persisted with the session (survives a resume or a
  facilitator restart) and is what grading, `GET /api/exam`, and every
  single-question endpoint are scoped to for that attempt — a pool
  question outside the draw is a 404, not merely ungraded.
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
domain coverage; and that no single option position is correct on more
than half of the single-answer questions — a degenerate key reads like a
pattern. The weight-versus-content check has two modes: without
`examLength` (or one that does not shrink the pool), each domain's share
of the pool's own points must sit within 2 percentage points of its
target — the pool IS the exam. With a smaller `examLength`, that
check instead requires each domain's POOL to be at least as deep as the
per-domain count a stratified draw of that size would need (the same
largest-remainder rounding `exam.DrawMCQ` uses) — the pool's own ratio
is free to differ, since every draw is stratified to the target
regardless.

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
- Exit 0 = criterion met, non-zero = failed, stdout = short message, optionally
  followed by an [artifact trailer](#showing-your-work-the-artifact-protocol).
- Never mutates the cluster or the filesystem.
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
the [\_lib/checks.sh](../banks/_lib/checks.sh) helpers rather than by hand:

```bash
[ "$sel" = "app=inventory" ] || {
  echo "selector is '$sel', want app=inventory"
  show_actual yaml "$(kubectl -n serpens get svc inventory -o yaml | k8s_clean)"
  show_expected yaml "/banks/${BANK:-ckad-mock-01}/q19/expected/service.yaml"
  show_why "A Service finds its Pods by label, never by name."
  exit 1
}
```

Call them **after** the failure message and **before** `exit 1`.
[q19/10\_service.sh](../banks/ckad-mock-01/q19/validate.d/10_service.sh) and
[q16/10\_probes.sh](../banks/ckad-mock-01/q16/validate.d/10_probes.sh) are the
two worked examples.

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

`show_expected` reads a file and nothing else, on purpose. Expected documents
live at `banks/<bank-id>/<qid>/expected/<name>` and are **generated from the
reference solution, never hand-written** — a hand-written "expected" drifts
from what `tests/solutions/<bank>/<qid>.sh` actually produces and then teaches
the candidate something false, which is the same failure as a check that grades
spelling. Regenerate one by solving the question and re-running the check's own
`show_actual` pipeline against the result:

```bash
docker compose exec -T instance-1 su - candidate \
  -c 'bash /tests/solutions/ckad-mock-01/q19.sh'
docker compose exec -T instance-1 bash -c '. /banks/_lib/checks.sh
  kubectl -n serpens get svc inventory -o yaml | k8s_clean | yq "<the check's filter>"' \
  > banks/ckad-mock-01/q19/expected/service.yaml
```

Filter both panes identically, and filter out whatever the API server assigns
rather than the candidate: a `clusterIP` in the EXPECTED pane is an address
they never had, and showing it teaches them it was part of the answer.
`k8s_clean` removes the noise every object carries (`managedFields`, `status`,
`resourceVersion`, `uid`, `generation`, `creationTimestamp`, the
`last-applied-configuration` annotation); anything else the question is not
about is the check's own `yq`/`jq` filter to remove.

A question with no `expected/` document is fine — `show_expected` emits
nothing and the candidate gets the message they always had. Prefer that to
inventing one. `q19/20_reachable.sh` deliberately has none: an EndpointSlice is
written by a controller, with a random name suffix and Pod IPs for addresses,
so an authored "expected" one would only teach a candidate to look for numbers
that were never going to be theirs.

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
`show_actual`/`show_expected` **on the same line**. Scoring on a serialisation
grades spelling; showing one is the opposite errand, and there is no other way
to produce a whole document for the pane. Capture the same pipeline into a
variable and the rule fires again, because there is then something to compare
it to.

`diff` gets no such exemption, and the artifact protocol is not a loophole in
it. **A grader emits what it found and what it wanted; it never emits a
diff.** The explanation screen's side-by-side is *rendered* client-side from
the `actual` and `expected` documents, after grading, where being wrong costs
nothing. The ban is on `diff` deciding a *score*, and that reason is untouched:
line order and whitespace are not the candidate's answer, and a check that
scores them fails correct work.

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
  draws the title twice and the ssh host three times. This used to be the
  opposite rule, back when the markdown was the only channel for either.
  Naming the instance in prose was also an un-gated way to disagree with
  `spec.questions[].instance`, which is the field that actually decides
  where a check runs; there is now nothing to disagree with.
- Checks must be side-effect free. `check-lint` catches the known brittle
  idioms, not mutation.
- `# desc:` is parsed ([exam.go:169,192](../facilitator/internal/exam/exam.go))
  and never validated, so a missing one ships an empty description to the score
  screen in silence.
- `spec.instances` feeds only the exam selector's availability flag;
  `spec.questions[].instance` is what decides where a check actually runs.
