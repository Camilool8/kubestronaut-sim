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
  environment:
    provider: kind
    nodes: 2                    # informational; 1 control-plane + N-1 workers
  instances:                    # ssh targets; 1 or 2 entries, names MUST be
    - name: instance-1          # instance-1 / instance-2 — the compose topology
    - name: instance-2          # is generic so every bank runs unmodified.
                                # (Per-bank ssh aliases, e.g. cka-1 -> instance-1,
                                # are a possible future enhancement.)
  questions:
    - id: q01                   # directory name
      instance: instance-1      # where the candidate solves it
      domain: Application Design and Build
      weight: 5                 # informational; scoring = sum of check points
```

## Question directory: `banks/<bank-id>/<qid>/`

| File            | Purpose |
|-----------------|---------|
| `question.md`   | Statement shown to the candidate. Must name the instance and any artifact paths (`/opt/course/<n>/...`). |
| `setup.sh`      | Seeds cluster pre-state. Runs inside `k8s-env` as root with admin `KUBECONFIG`. MUST be idempotent (safe to re-run). |
| `files/`        | Optional. Copied into `/opt/course/<n>/` on every instance at start, owned by `candidate`. |
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
  `KUBECONFIG=/home/candidate/.kube/config`.
- Header comments (parsed by the grader):
  `# points: <int>` and `# desc: <one line>`.
- Exit 0 = criterion met. Non-zero = failed. stdout = short message.
- Must be side-effect free (never mutate cluster or files).
- Must finish within 30 seconds. The facilitator runs each check under a
  30s deadline; a check still running past it is killed and scored failed
  (message: "check timed out"), regardless of what it would eventually have
  returned.

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
kubectl -n "$NS" run probe-ok --rm -i --restart=Never --image=busybox:1.37 \
  --labels=role=frontend --command -- wget -q -T 4 -O- http://api:80
# ...and the denied one must time out, not merely be absent
kubectl -n "$NS" run probe-deny --rm -i --restart=Never --image=busybox:1.37 \
  --labels=role=other --command -- wget -q -T 4 -O- http://api:80 && exit 1
```

Budget for it: a probe Pod plus its timeout has to fit inside the check
contract's 30 seconds, so keep `-T` low and run at most two probes per
script.

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
