# Question Bank Specification (v1alpha2)

A bank lives at `banks/<bank-id>/` and contains `exam.yaml` plus one
directory per question. The conductor scans every `banks/*/exam.yaml`
into the exam catalog the UI's lobby renders; `banks/catalog.yaml` adds
coming-soon entries whose exam engine doesn't exist yet.

## exam.yaml

```yaml
apiVersion: sim.kubestronaut.dev/v1alpha2
kind: Exam
metadata:
  name: ckad-mock-01            # must equal directory name
  title: CKAD Mock Exam 01
  certification: CKAD           # catalog badge (CKAD/CKA/CKS/...)
  description: >-               # one-liner shown on the catalog card
    Developer-track exercises.
spec:
  examType: hands-on            # only "hands-on" runs today; anything else
                                # is listed in the catalog but disabled
  duration: 120m                # enforced: the facilitator auto-ends the session at 0:00
  passingScore: 66              # percent; enforced: facilitator's Results.Passed
  kubernetesVersion: "1.35"     # informational
  domainWeights:                # optional; see "Points and domain weights"
    Application Design and Build: 20
    Application Deployment: 20
    Application Environment, Configuration and Security: 25
    Application Observability and Maintenance: 15
    Services and Networking: 20
  environment:
    provider: kind
    nodes: 2                    # informational; 1 control-plane + N-1 workers
  instances:                    # ssh targets; 1 or 2 entries, names MUST be
    - name: instance-1          # instance-1 / instance-2 — the compose topology
    - name: instance-2          # is generic so every bank runs unmodified.
                                # (Per-bank ssh aliases are a possible
                                # future enhancement.)
  questions:
    - id: q01                   # directory name
      instance: instance-1      # where the candidate solves it
      domain: Application Design and Build
      weight: 6                 # MUST equal the sum of this question's
                                # check points; enforced by
                                # tests/bank-weights.sh
```

## Points and domain weights

**A domain's share of a bank's points is its curriculum weight.** Points
are not a property of a question — they are a property of its domain,
divided among the questions in it:

```
question points = domain budget / questions in that domain
check points    = split the question's total by how much each check matters
```

`spec.domainWeights` carries the certification's published weights, and
`tests/bank-weights.sh` fails the build if any domain's actual share
drifts more than **2 percentage points** from it.

This exists because the obvious alternative does not survive contact
with a growing bank. Assign points per question and every addition
shifts the balance a little; milestone H added two multi-container
questions to a finished 20-question bank and pushed Application Design
and Build from 20% to 28% without anyone noticing. Deriving the points
means adding a seventh question to a domain makes all seven worth
slightly less, automatically, and the balance cannot rot.

Two consequences worth expecting:

- **Questions in different domains are worth different amounts.** A
  bank with six Design-and-Build questions and three Observability ones
  will price the first at 6 points and the second at 9. That is what a
  weighted exam means, and the question list shows the number, so it is
  honest signalling rather than a hidden thumb on the scale.
- **Do not flatten a question into equal parts to hit its total.** The
  behavioural check is usually worth more than the structural ones that
  set it up, and that ordering is the teaching.

`tests/bank-weights.sh` runs offline in about a second — no cluster, no
containers — and `tests/smoke.sh` calls it before the destructive purge,
so a weighting mistake fails immediately instead of forty minutes into a
cold boot. It asserts three things:

1. each domain's share is within 2 percentage points of its
   `spec.domainWeights` entry;
2. every question's `weight:` equals the sum of its `# points:` headers;
3. the questions in `exam.yaml` and the `q*/` directories on disk are
   the same set.

A bank with no `spec.domainWeights` is exempt from (1) but still subject
to (2) and (3), so a bank that has not been mapped to a curriculum
(`smoke-01`, the hidden switch-test fixture) stays green.

`metadata.hidden: true` keeps a bank out of the lobby while leaving it a
legal `switch` target. It exists for `smoke-01` and should not be used by
a real bank — a bank worth shipping is worth listing.

## Question directory: `banks/<bank-id>/<qid>/`

| File            | Purpose |
|-----------------|---------|
| `question.md`   | Statement shown to the candidate. Must name the instance and any artifact paths (`/opt/course/<n>/...`). |
| `setup.sh`      | Seeds cluster pre-state. Runs inside `k8s-env` as root with admin `KUBECONFIG`. MUST be idempotent (safe to re-run). |
| `files/`        | Optional. Copied into `/opt/course/<n>/` on every instance at start, owned by `candidate`. |
| `hints.md` | optional progressive hints, shown in Training mode |
| `validate.d/NN_name.sh` | One scoring criterion each, run in lexical order. |
| `solution.md`   | Full walkthrough, shown after the exam. |

`files/` is how a question hands the candidate starting material: a
Dockerfile to edit, a manifest on a removed apiVersion, a kustomize base.
It cannot be done from `setup.sh`, which runs on `k8s-env` and has no
access to the per-instance `/opt/course` volumes.

The copy **never overwrites**. It runs on every instance start, but only
creates files that are not already there, because for these questions the
seeded file *is* the answer sheet — `./sim down && ./sim up` resumes an
attempt, and re-copying would throw the candidate's edits away. A reset
clears `/opt/course` first, so it seeds fresh copies; a restart does not.

Do not ship anything under `files/` that a check reads without the
candidate having modified it: it would score whether the copy worked, not
whether they did anything.

## Code blocks in `question.md` / `solution.md`

Use fenced blocks (` ``` `), never 4-space indentation — the UI's syntax
highlighter only recognizes a fenced block's language tag, so an indented
block always renders as plain, uncolored text. Tag each fence with what the
content actually is: `bash` for shell commands (`kubectl`/`k`, pipelines,
redirects), `yaml` for Kubernetes manifests and manifest fragments, `json`
for JSON payloads. `sh` and `shell` are also accepted and alias to `bash`.
Omit the tag entirely for anything else (plain command output, non-YAML/JSON
file contents) — that renders as a plain "text" block, which is correct and
expected. Any other tag, or a typo, silently falls back to the same plain
"text" rendering, so there's no harm in leaving a block untagged when unsure
— just never guess a supported tag for content that isn't actually that
language, since the wrong color reads as a wrong answer on a study tool.

A shell heredoc wrapping a manifest (`k apply -f - <<'EOF'` … `EOF`) is a
`bash` block, not a `yaml` one. It is one command the candidate copies and
runs as a unit, so splitting the wrapper from the payload would hand them
two halves neither of which works alone — and the copy-whole-block button
would copy the wrong thing. Tagged `bash`, the heredoc body renders plain
(the highlighter colors only the quoted delimiter), which is the correct
"can't claim this, so don't color it" outcome. Tagged `yaml`, the command
line itself would be colored as a manifest, which is precisely the wrong
color this section warns about.

## Validate script contract

- Executed ON the question's instance, as root, with
  `KUBECONFIG=/home/candidate/.kube/config` and `BANK=<bank-id>` — the
  latter so a check can read its own bank's pristine `files/` under
  `/banks/$BANK/<qid>/files` to prove a reference file was left alone.
- Header comments (parsed by the grader):
  `# points: <int>` and `# desc: <one line>`. The grader's pattern is
  exact — `# points: N`, one space, no leading zeros — and
  `tests/check-lint.sh` enforces it, because a header the weights gate
  reads and the grader skips makes the two disagree silently about what
  a question is worth.
- Source `/banks/_lib/checks.sh` and use its helpers.
- Exit 0 = criterion met. Non-zero = failed. stdout = short message.
- Must be side-effect free (never mutate cluster or files).
- Must finish within 30 seconds. The facilitator runs each check under a
  30s deadline; a check still running past it is killed and scored failed
  (message: "check timed out"), regardless of what it would eventually have
  returned.

### Grade behaviour, not spelling

The rule: **a check that fails a correct answer is worse than no check at
all.** It teaches the candidate something false about Kubernetes and
costs them points they earned, and it does so invisibly — they see a red
row, not a linting complaint.

Read the live API object (`-o jsonpath`, or `-o json | jq`), never the
manifest as text. The API server normalises field order, indentation and
quoting before a check sees anything, so `limits` before `requests` is
byte-identical to the reverse. This is why key ordering has never been
gradeable here, and it must stay that way.

`/banks/_lib/checks.sh` carries the normalisers. Source it first:

```bash
set -uo pipefail
. /banks/_lib/checks.sh
```

| helper | for |
|---|---|
| `milli` / `mib` | quantities by value — `0.1` and `100m` are the same CPU request |
| `mode_decimal` | octal file modes against the decimal the API stores (`0400` → `256`) |
| `file_text` | answer files a human typed — strips CRLF and surrounding whitespace |
| `file_lines_sorted` | list answers, non-blank and trimmed |
| `same_set` | two lists holding the same members, ignoring order |
| `contains_kv` | `key = value` with any spacing around the `=` |
| `contains_pair` | `key value` with any run of whitespace between |
| `yaml_api_versions` | apiVersions via `yq`, never `grep` |
| `semver_ge` | versions compared as versions |

`tests/check-lint.sh` fails the build on `diff`, `grep` against a YAML
path, `kubectl get -o yaml`, `kubectl run`, and `grep -qx`; it warns on a
fixed `[0]` index. Any line may opt out with `# lint: allow-<rule>` where
the pattern is genuinely correct. `tests/check-lib.sh` unit-tests the
helpers themselves. Both are offline and run first in `smoke.sh`.

## What the cluster provides

Guarantees a question may rely on. Each one is installed by
`images/k8s-env/bootstrap.sh` before any `setup.sh` runs.

**NetworkPolicy is enforced.** The CNI is Calico, not kind's default
kindnet. This is the difference between a policy question that can only
check the shape of a candidate's YAML and one that can check what the
policy *does* — and, more importantly, between a candidate who has to
guess and one who can test. Prefer behavioural checks:

```bash
# in a validate.d script: the allowed path must work...
kubectl -n "$NS" exec deploy/frontend -- wget -q -T 4 -O /dev/null http://api:80
# ...and the denied one must time out, not merely be absent
kubectl -n "$NS" exec deploy/metrics  -- wget -q -T 4 -O /dev/null http://api:80 && exit 1
```

**Make the request from a workload the question already runs.** Do not
create a probe Pod. `kubectl run --rm` has to schedule a Pod, pull its
image, run the command and tear it down, and that uses most of the 30
seconds a check is allowed — so the check passes on an idle cluster and
times out on a busy one. A timed-out check is scored **failed**, which
means a correct answer silently loses points because the machine was
busy. That is not hypothetical: three checks were written that way, each
worth 5 points, and two of them dropped 10 points from a 180/180 answer
the first time two grading runs happened back-to-back.

`exec` costs about a second, mutates nothing, and tests the same thing —
the request still crosses DNS, kube-proxy, the Service's selector and its
targetPort. If a question genuinely has no running workload to exec into,
it probably needs one in `setup.sh` anyway, so the candidate has
something to test against too.

**An Ingress controller exists.** ingress-nginx, pinned to the
control-plane node, with IngressClass `nginx`. Ingress questions can
require a real controller to admit and route the rule.

**A Helm repository is pre-added.** Charts under `banks/_charts/` are
packaged at bootstrap and served from `k8s-env:8879`; every instance has
it configured as `sim` before the candidate logs in. `helm` is available
to `setup.sh` (which runs on k8s-env) too, so a question can seed
releases — including one deliberately left in a bad state.

**A registry is reachable at `registry:5000`.** Plain HTTP, no auth, from
the instances only. Podman is installed on the instances, so a question
can ask a candidate to edit a Dockerfile, build, tag, push and run.

### Testing: in-cluster first

Questions must be solvable and verifiable **from inside the cluster** —
that is what the real exam expects, and the instances are not cluster
nodes, so a ClusterIP is not reachable from an instance shell. The
idiom, in both `solution.md` and `validate.d`:

```bash
kubectl -n <ns> run tmp --rm -it --restart=Never --image=nginx:alpine -- curl -m 5 <svc>
```

Ports are also mapped out to the host — `:8081` → ingress HTTP, `:8443`
→ ingress HTTPS, `:30080-30082` → NodePorts — which the real exam does
not offer. That path exists so a candidate can open their own Ingress in
a browser while learning. **No `validate.d` check may depend on it**: it
is outside the cluster, it is off by default when `SIM_BIND` is set to
loopback on another host, and grading must not vary with either.

## Runtime environment provided to scripts

- `/shared/kubeconfig` — admin kubeconfig (server `https://k8s-env:6443`).
- Instances: candidate user `candidate` (password `candidate`, and
  passwordless `sudo`), kubeconfig at `~/.kube/config`, writable
  `/opt/course/`, tools: kubectl, helm, yq, jq, vim, nano, podman.
- `/opt/course/<n>` is pre-created on every instance for each question
  (`<n>` = the digits of the question id, e.g. `q01` → `/opt/course/1`),
  owned by `candidate`. Questions must never require creating these
  directories — candidates only write files into them, as on the real exam.
- `/banks` mounted read-only on k8s-env and instances.
- `spec.environment.allowedDomains` (optional): domain suffixes the exam
  desktop's browser may reach through the docs proxy; subdomains
  included. Omit it to inherit `allow.DefaultDomains`
  (`proxy/internal/allow/allow.go`), which is the smallest set that
  leaves the documentation sites actually usable — the docs themselves,
  `code.jquery.com` (kubernetes.io's JS is a jQuery IIFE; without it the
  search box and sidebar never wire up), the font hosts, and helm.sh's
  Algolia search hosts. Analytics and Google Programmable Search are
  deliberately excluded: with Google unreachable, kubernetes.io falls
  back to Pagefind, the search index it serves itself, which matches the
  real exam's rule that the docs search is allowed but external search
  results are not. Adding a host here widens what a candidate can reach,
  so keep it to things a documentation page genuinely needs.


## Hints: `banks/<bank-id>/<qid>/hints.md`

Optional. One file, `## Hint N` headings, tiers numbered from 1:

```markdown
## Hint 1

Which field decides this? `kubectl explain` knows.

## Hint 2

`spec.selector` on the Service against `--show-labels` on the Pods.
```

Text before the first heading is ignored, so an author can leave a note.
Bodies render through the same Markdown component the question does, so
fenced blocks get their copy buttons for free.

The rules, enforced by `tests/bank-hints.sh`:

- **exactly two tiers**, numbered 1 and 2, neither empty
- **a hint is not the solution.** A tier sharing 120+ consecutive
  characters with `solution.md` fails the build. A "hint" a candidate can
  paste removes the exercise while looking like help, and nothing else in
  the repo would catch it.
- tier 1 points at the *concept* ("which field controls this?"); tier 2
  names the exact resource, field or flag — but still does not write the
  answer out.

Hints are served one tier at a time by
`GET /api/questions/{id}/hints/{n}`, gated on the attempt being in
Training mode. A bank with no `hints.md` files is valid; the tray simply
does not appear.

## Attempt modes

`spec.duration` is the Exam clock. `spec.speedDuration` is optional and
defaults to half of it — that is Speed mode. Training has no clock at
all, which is also the project's answer to WCAG 2.2.1 Timing Adjustable.
