# Milestone A: Exam Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working CLI-only CKAD practice exam: `./sim up` boots a 2-node KIND cluster (inside DinD) with seeded pre-state and two ssh instance containers; the candidate solves questions via `./sim ssh`; `./sim grade` prints a killer.sh-style per-check scoreboard.

**Architecture:** Modular Docker Compose stack. `k8s-env` is a privileged DinD container that creates the KIND cluster, exports an admin kubeconfig reachable at `k8s-env:6443`, runs each question's `setup.sh`, and hosts the grader (ssh'ing into instances to run validate scripts). Two lightweight `instance` containers (`ckad-1`, `ckad-2`) mimic killer.sh's ssh-target model. The question bank format defined here is the permanent contract later milestones (facilitator, evaluator service, UI) consume.

**Tech Stack:** Bash, Docker Compose, KIND, kubectl/helm, yq. (Go/React arrive in Milestones C/D — none here.)

## Global Constraints

- License: code Apache-2.0; `banks/` content CC BY-SA 4.0.
- All question content must be ORIGINAL. `/Users/cjoga/Labs/killer-sh-ckad-dump.txt` is a style/difficulty reference only — never copy its text, namespace names, or question wording.
- Target Kubernetes `v1.35.x` (fallback `v1.34.x` if no `kindest/node` image exists — verified in Task 6).
- Validate scripts: run on the question's instance as root, `KUBECONFIG=/home/candidate/.kube/config`; header comments `# points: N` and `# desc: ...`; exit 0 = pass; stdout = human message.
- `setup.sh` scripts: run inside `k8s-env` with admin kubeconfig, must be idempotent.
- All images must build on both arm64 (Camilo's Mac) and amd64 (use `dpkg --print-architecture` / `uname -m` for binary downloads).
- Instance service names in `docker-compose.yaml` must match `spec.instances[].name` in `exam.yaml`.
- Known limitation (accepted for this milestone): KIND's default CNI does not enforce NetworkPolicy, so NP checks are spec-based (jsonpath), not functional. Calico lands with the CKA/CKS provider work.

---

### Task 1: Repository scaffold

**Files:**
- Create: `.gitignore`, `LICENSE`, `banks/LICENSE`, `README.md`
- Create (empty dirs via .gitkeep): `images/`, `tests/solutions/`

**Interfaces:**
- Produces: repo layout all later tasks write into.

- [ ] **Step 1: Write `.gitignore`**

```gitignore
.DS_Store
*.log
.idea/
.vscode/
shared/
```

- [ ] **Step 2: Add licenses**

Download the Apache-2.0 text into `LICENSE` (copyright line: `Copyright 2026 Camilo Joga`):

```bash
curl -fsSL https://www.apache.org/licenses/LICENSE-2.0.txt -o LICENSE
```

Write `banks/LICENSE`:

```text
The question banks in this directory are licensed under the
Creative Commons Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0).
https://creativecommons.org/licenses/by-sa/4.0/

All questions are original works. They are inspired in format by public
Kubernetes certification simulators but share no text with them.
```

- [ ] **Step 3: Write `README.md` stub**

```markdown
# kubestronaut-sim

Open-source, killer.sh-style exam simulator for the Kubestronaut certifications.
Deliberately harder than the real exams. Starting with CKAD.

**Status: early development — Milestone A (CLI exam foundation).**

Quickstart lives at the bottom of this file once Milestone A lands.

Code: Apache-2.0. Question banks: CC BY-SA 4.0 (see `banks/LICENSE`).
Not affiliated with CNCF, The Linux Foundation, PSI, or killer.sh.
```

- [ ] **Step 4: Verify and commit**

```bash
git add -A && git status --short
git commit -m "chore: scaffold repository, licenses, README"
```

Expected: commit succeeds; `git ls-files` shows the files above plus `docs/superpowers/**`.

---

### Task 2: Question bank specification

**Files:**
- Create: `docs/bank-spec.md`

**Interfaces:**
- Produces: the contract consumed by Tasks 3–4 (content), 6 (setup runner), 8 (grader), and by later milestones' evaluator/facilitator.

- [ ] **Step 1: Write `docs/bank-spec.md`**

```markdown
# Question Bank Specification (v1alpha1)

A bank lives at `banks/<bank-id>/` and contains `exam.yaml` plus one
directory per question.

## exam.yaml

    apiVersion: sim.kubestronaut.dev/v1alpha1
    kind: Exam
    metadata:
      name: ckad-mock-01            # must equal directory name
      title: CKAD Mock Exam 01
    spec:
      duration: 120m
      passingScore: 66              # percent
      kubernetesVersion: "1.35"
      environment:
        provider: kind
        nodes: 2                    # 1 control-plane + N-1 workers
      instances:                    # ssh targets; compose services must match
        - name: ckad-1
        - name: ckad-2
      questions:
        - id: q01                   # directory name
          instance: ckad-1          # where the candidate solves it
          domain: Application Design and Build
          weight: 5                 # informational; scoring = sum of check points

## Question directory: `banks/<bank-id>/<qid>/`

| File            | Purpose |
|-----------------|---------|
| `question.md`   | Statement shown to the candidate. Must name the instance and any artifact paths (`/opt/course/<n>/...`). |
| `setup.sh`      | Seeds pre-state. Runs inside `k8s-env` as root with admin `KUBECONFIG`. MUST be idempotent (safe to re-run). |
| `validate.d/NN_name.sh` | One scoring criterion each, run in lexical order. |
| `solution.md`   | Full walkthrough, shown after the exam. |

## Validate script contract

- Executed ON the question's instance, as root, with
  `KUBECONFIG=/home/candidate/.kube/config`.
- Header comments (parsed by the grader):
  `# points: <int>` and `# desc: <one line>`.
- Exit 0 = criterion met. Non-zero = failed. stdout = short message.
- Must be side-effect free (never mutate cluster or files).

## Runtime environment provided to scripts

- `/shared/kubeconfig` — admin kubeconfig (server `https://k8s-env:6443`).
- Instances: candidate user `candidate` (password `candidate`), kubeconfig
  at `~/.kube/config`, writable `/opt/course/`, tools: kubectl, helm, yq,
  jq, vim, nano.
- `/banks` mounted read-only on k8s-env and instances.
```

- [ ] **Step 2: Commit**

```bash
git add docs/bank-spec.md && git commit -m "docs: question bank specification v1alpha1"
```

---

### Task 3: Bank `ckad-mock-01` — exam.yaml + q01 (exemplar)

**Files:**
- Create: `banks/ckad-mock-01/exam.yaml`
- Create: `banks/ckad-mock-01/q01/{question.md,setup.sh,solution.md}`
- Create: `banks/ckad-mock-01/q01/validate.d/{10_list-file.sh,20_namespace.sh,30_quota.sh}`
- Test: `tests/solutions/q01.sh`

**Interfaces:**
- Produces: `exam.yaml` consumed by bootstrap (Task 6) and grader (Task 8); `tests/solutions/q01.sh` consumed by smoke test (Task 9). Solution scripts run as user `candidate` on the question's instance.

- [ ] **Step 1: Write `banks/ckad-mock-01/exam.yaml`**

```yaml
apiVersion: sim.kubestronaut.dev/v1alpha1
kind: Exam
metadata:
  name: ckad-mock-01
  title: CKAD Mock Exam 01
spec:
  duration: 120m
  passingScore: 66
  kubernetesVersion: "1.35"
  environment:
    provider: kind
    nodes: 2
  instances:
    - name: ckad-1
    - name: ckad-2
  questions:
    - id: q01
      instance: ckad-1
      domain: Application Environment, Configuration and Security
      weight: 5
    - id: q02
      instance: ckad-1
      domain: Application Deployment
      weight: 7
    - id: q03
      instance: ckad-2
      domain: Services and Networking
      weight: 5
```

- [ ] **Step 2: Write `q01/question.md`**

```markdown
# Question 1 | Namespaces & ResourceQuota

*Solve this question on instance: `ssh ckad-1`*

Team Aurora owns every Namespace labeled `team=aurora`.

1. Create a new Namespace `aurora-staging` labeled `team=aurora`.
2. In it, create a ResourceQuota named `staging-quota` that limits the
   Namespace to at most **5 Pods** and **1 CPU** of total requests.
3. Save an alphabetically sorted list of the **names only** (no header, one
   per line) of all Namespaces labeled `team=aurora` — including the one you
   just created — to `/opt/course/1/aurora-namespaces` on `ckad-1`.
```

- [ ] **Step 3: Write `q01/setup.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
for ns in aurora-web aurora-data; do
  kubectl create ns "$ns" --dry-run=client -o yaml | kubectl apply -f -
  kubectl label ns "$ns" team=aurora --overwrite
done
kubectl create ns borealis-api --dry-run=client -o yaml | kubectl apply -f -
kubectl label ns borealis-api team=borealis --overwrite
```

- [ ] **Step 4: Write the three validate scripts**

`validate.d/10_list-file.sh`:

```bash
#!/usr/bin/env bash
# points: 2
# desc: /opt/course/1/aurora-namespaces lists team=aurora namespaces, sorted, names only
set -uo pipefail
f=/opt/course/1/aurora-namespaces
[ -f "$f" ] || { echo "$f not found"; exit 1; }
expected=$(kubectl get ns -l team=aurora -o name | cut -d/ -f2 | sort)
if diff <(printf '%s\n' "$expected") <(grep -v '^[[:space:]]*$' "$f") >/dev/null; then
  echo "list matches"
else
  echo "list content mismatch"; exit 1
fi
```

`validate.d/20_namespace.sh`:

```bash
#!/usr/bin/env bash
# points: 1
# desc: Namespace aurora-staging exists with label team=aurora
set -uo pipefail
lbl=$(kubectl get ns aurora-staging -o jsonpath='{.metadata.labels.team}' 2>/dev/null)
[ "$lbl" = "aurora" ] && echo "namespace ok" || { echo "missing ns or label"; exit 1; }
```

`validate.d/30_quota.sh`:

```bash
#!/usr/bin/env bash
# points: 2
# desc: ResourceQuota staging-quota limits pods=5 and requests.cpu=1
set -uo pipefail
out=$(kubectl -n aurora-staging get quota staging-quota \
  -o jsonpath='{.spec.hard.pods} {.spec.hard.requests\.cpu}' 2>/dev/null)
[ "$out" = "5 1" ] && echo "quota ok" || { echo "quota wrong or missing (got: '$out')"; exit 1; }
```

- [ ] **Step 5: Write `q01/solution.md`**

```markdown
# Solution 1

    k create ns aurora-staging
    k label ns aurora-staging team=aurora
    k -n aurora-staging create quota staging-quota --hard=pods=5,requests.cpu=1
    mkdir -p /opt/course/1
    k get ns -l team=aurora -o name | cut -d/ -f2 | sort > /opt/course/1/aurora-namespaces

Verify: `cat /opt/course/1/aurora-namespaces` → aurora-data, aurora-staging,
aurora-web (one per line).
```

- [ ] **Step 6: Write `tests/solutions/q01.sh`** (runs as `candidate` on ckad-1)

```bash
#!/usr/bin/env bash
set -euo pipefail
kubectl create ns aurora-staging --dry-run=client -o yaml | kubectl apply -f -
kubectl label ns aurora-staging team=aurora --overwrite
kubectl -n aurora-staging create quota staging-quota --hard=pods=5,requests.cpu=1 \
  --dry-run=client -o yaml | kubectl apply -f -
mkdir -p /opt/course/1
kubectl get ns -l team=aurora -o name | cut -d/ -f2 | sort > /opt/course/1/aurora-namespaces
```

- [ ] **Step 7: Lint and commit**

```bash
chmod +x banks/ckad-mock-01/q01/setup.sh banks/ckad-mock-01/q01/validate.d/*.sh tests/solutions/q01.sh
bash -n banks/ckad-mock-01/q01/setup.sh banks/ckad-mock-01/q01/validate.d/*.sh tests/solutions/q01.sh
git add banks tests && git commit -m "feat(bank): ckad-mock-01 exam.yaml and q01 (namespaces + quota)"
```

Expected: `bash -n` silent (no syntax errors).

---

### Task 4: Bank content — q02 (broken Deployment) and q03 (NetworkPolicy)

**Files:**
- Create: `banks/ckad-mock-01/q02/{question.md,setup.sh,solution.md}`, `banks/ckad-mock-01/q02/validate.d/{10_image.sh,20_ready.sh,30_probe.sh,40_strategy.sh,50_oldimage.sh}`
- Create: `banks/ckad-mock-01/q03/{question.md,setup.sh,solution.md}`, `banks/ckad-mock-01/q03/validate.d/{10_np-exists.sh,20_ingress.sh,30_egress.sh}`
- Test: `tests/solutions/q02.sh`, `tests/solutions/q03.sh`

**Interfaces:**
- Consumes: contract from Task 2. Same script contracts as Task 3.

- [ ] **Step 1: Write `q02/question.md`**

```markdown
# Question 2 | Fix a failing Deployment

*Solve this question on instance: `ssh ckad-1`*

Deployment `nova-api` in Namespace `nova` is failing to roll out.

1. Before changing anything, save the currently configured (broken) container
   image name to `/opt/course/2/old-image` on `ckad-1`.
2. Fix the Deployment: the image should be `nginx:1.29-alpine`.
3. Scale it to **3 replicas** and wait until all are ready.
4. Add a readinessProbe: HTTP GET `/` on port `80`, `initialDelaySeconds: 5`,
   `periodSeconds: 10`.
5. Configure the rollout strategy so updates never reduce available replicas:
   `maxSurge: 1`, `maxUnavailable: 0`.
```

- [ ] **Step 2: Write `q02/setup.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
kubectl create ns nova --dry-run=client -o yaml | kubectl apply -f -
kubectl -n nova apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nova-api
  namespace: nova
spec:
  replicas: 1
  selector:
    matchLabels: {app: nova-api}
  template:
    metadata:
      labels: {app: nova-api}
    spec:
      containers:
      - name: api
        image: nginx:1.99
EOF
```

- [ ] **Step 3: Write q02 validate scripts**

`validate.d/10_image.sh`:

```bash
#!/usr/bin/env bash
# points: 1
# desc: image is nginx:1.29-alpine
set -uo pipefail
img=$(kubectl -n nova get deploy nova-api -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null)
[ "$img" = "nginx:1.29-alpine" ] && echo "image ok" || { echo "image is '$img'"; exit 1; }
```

`validate.d/20_ready.sh`:

```bash
#!/usr/bin/env bash
# points: 2
# desc: 3/3 replicas ready
set -uo pipefail
ready=$(kubectl -n nova get deploy nova-api -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "$ready" = "3" ] && echo "3 ready" || { echo "readyReplicas='$ready'"; exit 1; }
```

`validate.d/30_probe.sh`:

```bash
#!/usr/bin/env bash
# points: 2
# desc: readinessProbe httpGet / :80, initialDelay 5, period 10
set -uo pipefail
out=$(kubectl -n nova get deploy nova-api -o jsonpath='{.spec.template.spec.containers[0].readinessProbe.httpGet.path} {.spec.template.spec.containers[0].readinessProbe.httpGet.port} {.spec.template.spec.containers[0].readinessProbe.initialDelaySeconds} {.spec.template.spec.containers[0].readinessProbe.periodSeconds}' 2>/dev/null)
[ "$out" = "/ 80 5 10" ] && echo "probe ok" || { echo "probe fields: '$out'"; exit 1; }
```

`validate.d/40_strategy.sh`:

```bash
#!/usr/bin/env bash
# points: 1
# desc: rollingUpdate maxSurge=1 maxUnavailable=0
set -uo pipefail
out=$(kubectl -n nova get deploy nova-api -o jsonpath='{.spec.strategy.rollingUpdate.maxSurge} {.spec.strategy.rollingUpdate.maxUnavailable}' 2>/dev/null)
[ "$out" = "1 0" ] && echo "strategy ok" || { echo "strategy: '$out'"; exit 1; }
```

`validate.d/50_oldimage.sh`:

```bash
#!/usr/bin/env bash
# points: 1
# desc: /opt/course/2/old-image contains the broken image name
set -uo pipefail
grep -qx 'nginx:1.99' /opt/course/2/old-image 2>/dev/null \
  && echo "old image recorded" || { echo "wrong or missing /opt/course/2/old-image"; exit 1; }
```

- [ ] **Step 4: Write `q02/solution.md`**

```markdown
# Solution 2

    mkdir -p /opt/course/2
    k -n nova get deploy nova-api -o jsonpath='{.spec.template.spec.containers[0].image}' > /opt/course/2/old-image
    k -n nova edit deploy nova-api

In the editor: set image `nginx:1.29-alpine`, `replicas: 3`, add under the
container:

    readinessProbe:
      httpGet: {path: /, port: 80}
      initialDelaySeconds: 5
      periodSeconds: 10

and under `spec.strategy`:

    rollingUpdate: {maxSurge: 1, maxUnavailable: 0}

Then `k -n nova rollout status deploy nova-api`.
```

- [ ] **Step 5: Write `tests/solutions/q02.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
mkdir -p /opt/course/2
kubectl -n nova get deploy nova-api \
  -o jsonpath='{.spec.template.spec.containers[0].image}' > /opt/course/2/old-image
kubectl -n nova patch deploy nova-api --type=strategic -p '{
  "spec": {
    "replicas": 3,
    "strategy": {"rollingUpdate": {"maxSurge": 1, "maxUnavailable": 0}},
    "template": {"spec": {"containers": [{
      "name": "api",
      "image": "nginx:1.29-alpine",
      "readinessProbe": {
        "httpGet": {"path": "/", "port": 80},
        "initialDelaySeconds": 5, "periodSeconds": 10
      }
    }]}}
  }
}'
kubectl -n nova rollout status deploy nova-api --timeout=180s
```

- [ ] **Step 6: Write `q03/question.md`**

```markdown
# Question 3 | NetworkPolicy lockdown

*Solve this question on instance: `ssh ckad-2`*

Namespace `orbit` runs Deployments `frontend` (`role=frontend`), `api`
(`role=api`) and `metrics` (`role=metrics`).

Create a NetworkPolicy named `api-guard` in Namespace `orbit`:

1. It must select the `role=api` Pods.
2. Ingress: allow **only** Pods labeled `role=frontend` from the same
   Namespace, and only on TCP port `80`.
3. Egress: allow **only** DNS (UDP and TCP port `53`).
4. Everything else to/from the `api` Pods must be denied.
```

- [ ] **Step 7: Write `q03/setup.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
kubectl create ns orbit --dry-run=client -o yaml | kubectl apply -f -
for role in frontend api metrics; do
  kubectl -n orbit apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: $role
  namespace: orbit
spec:
  replicas: 1
  selector:
    matchLabels: {role: $role}
  template:
    metadata:
      labels: {role: $role}
    spec:
      containers:
      - name: main
        image: nginx:1.29-alpine
        ports: [{containerPort: 80}]
EOF
done
```

- [ ] **Step 8: Write q03 validate scripts**

`validate.d/10_np-exists.sh`:

```bash
#!/usr/bin/env bash
# points: 1
# desc: NetworkPolicy api-guard selects role=api and declares Ingress+Egress
set -uo pipefail
out=$(kubectl -n orbit get netpol api-guard \
  -o jsonpath='{.spec.podSelector.matchLabels.role} {.spec.policyTypes[*]}' 2>/dev/null)
{ [ "$out" = "api Ingress Egress" ] || [ "$out" = "api Egress Ingress" ]; } \
  && echo "selector+types ok" || { echo "got '$out'"; exit 1; }
```

`validate.d/20_ingress.sh`:

```bash
#!/usr/bin/env bash
# points: 2
# desc: single ingress rule: from role=frontend pods, TCP 80 only
set -uo pipefail
rules=$(kubectl -n orbit get netpol api-guard -o jsonpath='{.spec.ingress}' 2>/dev/null)
n=$(echo "$rules" | jq 'length')
from=$(echo "$rules" | jq -r '(.[0].from | length), .[0].from[0].podSelector.matchLabels.role')
ports=$(echo "$rules" | jq -r '(.[0].ports | length), .[0].ports[0].port, (.[0].ports[0].protocol // "TCP")')
[ "$n" = "1" ] && [ "$from" = "1
frontend" ] && [ "$ports" = "1
80
TCP" ] && echo "ingress ok" || { echo "ingress rule wrong"; exit 1; }
```

`validate.d/30_egress.sh`:

```bash
#!/usr/bin/env bash
# points: 2
# desc: egress allows only port 53 (UDP and TCP)
set -uo pipefail
eg=$(kubectl -n orbit get netpol api-guard -o jsonpath='{.spec.egress}' 2>/dev/null)
protos=$(echo "$eg" | jq -r '[.[].ports[] | "\(.port)/\(.protocol)"] | sort | join(",")')
[ "$protos" = "53/TCP,53/UDP" ] && echo "egress ok" || { echo "egress ports: '$protos'"; exit 1; }
```

- [ ] **Step 9: Write `q03/solution.md`**

```markdown
# Solution 3

    k -n orbit apply -f - <<'EOF'
    apiVersion: networking.k8s.io/v1
    kind: NetworkPolicy
    metadata:
      name: api-guard
      namespace: orbit
    spec:
      podSelector:
        matchLabels: {role: api}
      policyTypes: [Ingress, Egress]
      ingress:
      - from:
        - podSelector:
            matchLabels: {role: frontend}
        ports:
        - {protocol: TCP, port: 80}
      egress:
      - ports:
        - {protocol: UDP, port: 53}
        - {protocol: TCP, port: 53}
    EOF

Note: the simulator's KIND cluster does not enforce NetworkPolicy yet
(default CNI); scoring is spec-based. On the real exam, verify with
`k exec` + `wget -T2` between pods.
```

- [ ] **Step 10: Write `tests/solutions/q03.sh`** — same manifest as solution.md:

```bash
#!/usr/bin/env bash
set -euo pipefail
kubectl -n orbit apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-guard
  namespace: orbit
spec:
  podSelector:
    matchLabels: {role: api}
  policyTypes: [Ingress, Egress]
  ingress:
  - from:
    - podSelector:
        matchLabels: {role: frontend}
    ports:
    - {protocol: TCP, port: 80}
  egress:
  - ports:
    - {protocol: UDP, port: 53}
    - {protocol: TCP, port: 53}
EOF
```

- [ ] **Step 11: Lint and commit**

```bash
chmod +x banks/ckad-mock-01/q0{2,3}/setup.sh banks/ckad-mock-01/q0{2,3}/validate.d/*.sh tests/solutions/q0{2,3}.sh
bash -n banks/ckad-mock-01/q0{2,3}/setup.sh banks/ckad-mock-01/q0{2,3}/validate.d/*.sh tests/solutions/q0{2,3}.sh
git add banks tests && git commit -m "feat(bank): q02 broken deployment, q03 networkpolicy"
```

---

### Task 5: Instance image

**Files:**
- Create: `images/instance/Dockerfile`, `images/instance/entrypoint.sh`

**Interfaces:**
- Consumes: `/shared/kubeconfig` and `/shared/ssh/id_ed25519.pub` (produced by Task 6's bootstrap).
- Produces: ssh-reachable instance with user `candidate` (password `candidate`), root key-auth for the grader, kubectl/helm/yq/jq installed.

- [ ] **Step 1: Write `images/instance/Dockerfile`**

```dockerfile
FROM debian:12-slim
ARG KUBECTL_VERSION=v1.35.0
ARG HELM_VERSION=v3.18.0
ARG YQ_VERSION=v4.45.1
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssh-server curl ca-certificates vim nano jq less bash-completion procps \
    && rm -rf /var/lib/apt/lists/*
RUN ARCH=$(dpkg --print-architecture) \
    && curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${ARCH}/kubectl" \
    && curl -fsSL "https://get.helm.sh/helm-${HELM_VERSION}-linux-${ARCH}.tar.gz" | tar xz -C /tmp \
    && mv /tmp/linux-${ARCH}/helm /usr/local/bin/helm \
    && curl -fsSL -o /usr/local/bin/yq "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_${ARCH}" \
    && chmod +x /usr/local/bin/kubectl /usr/local/bin/helm /usr/local/bin/yq
RUN useradd -m -s /bin/bash candidate && echo 'candidate:candidate' | chpasswd \
    && mkdir -p /opt/course /run/sshd && chown candidate:candidate /opt/course \
    && printf 'alias k=kubectl\nsource <(kubectl completion bash)\ncomplete -o default -F __start_kubectl k\n' >> /home/candidate/.bashrc
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 22
ENTRYPOINT ["/entrypoint.sh"]
```

- [ ] **Step 2: Write `images/instance/entrypoint.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "waiting for cluster kubeconfig..."
until [ -f /shared/kubeconfig ] && [ -f /shared/ssh/id_ed25519.pub ]; do sleep 2; done
mkdir -p /home/candidate/.kube /home/candidate/.ssh /root/.ssh
cp /shared/kubeconfig /home/candidate/.kube/config
cp /shared/ssh/id_ed25519.pub /root/.ssh/authorized_keys
cp /shared/ssh/id_ed25519.pub /home/candidate/.ssh/authorized_keys
chown -R candidate:candidate /home/candidate/.kube /home/candidate/.ssh
chmod 600 /root/.ssh/authorized_keys /home/candidate/.ssh/authorized_keys
echo "instance ready: $(hostname)"
exec /usr/sbin/sshd -D -e
```

- [ ] **Step 3: Build and probe**

```bash
docker build -t sim-instance:dev images/instance
docker run --rm --entrypoint kubectl sim-instance:dev version --client
docker run --rm --entrypoint helm sim-instance:dev version --short
docker run --rm --entrypoint id sim-instance:dev candidate
```

Expected: kubectl reports `v1.35.x` (or the fallback pin), helm `v3.18.x`, `id` shows user candidate. If the kubectl/helm URL 404s, bump to the nearest available patch release and note it in the commit message.

- [ ] **Step 4: Commit**

```bash
git add images/instance && git commit -m "feat(images): instance image (sshd + kubectl/helm toolbox)"
```

---

### Task 6: k8s-env image (DinD + KIND bootstrap)

**Files:**
- Create: `images/k8s-env/Dockerfile`, `images/k8s-env/start.sh`, `images/k8s-env/bootstrap.sh`, `images/k8s-env/kind-config.yaml`

**Interfaces:**
- Consumes: `/banks/<BANK>/exam.yaml` (Task 3), `$BANK` env var.
- Produces: `/shared/kubeconfig` (admin, server `https://k8s-env:6443`), `/shared/ssh/id_ed25519{,.pub}`, `/shared/ready` marker; runs every question's `setup.sh`.

- [ ] **Step 1: Verify version pins**

```bash
curl -fsSL https://api.github.com/repos/kubernetes-sigs/kind/releases/latest | jq -r .tag_name
```

Pick the latest KIND release. Then check its release notes (`https://github.com/kubernetes-sigs/kind/releases`) for the newest supported `kindest/node` image for k8s 1.35; if 1.35 isn't listed, use the newest 1.34 image **with its sha256 digest from the release notes**, and set `kubernetesVersion` in `exam.yaml` to match. Record chosen values as the `ARG` defaults below.

- [ ] **Step 2: Write `images/k8s-env/kind-config.yaml`**

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: sim
networking:
  apiServerAddress: "0.0.0.0"
  apiServerPort: 6443
nodes:
  - role: control-plane
    kubeadmConfigPatches:
      - |
        kind: ClusterConfiguration
        apiServer:
          certSANs:
            - "k8s-env"
            - "localhost"
            - "127.0.0.1"
  - role: worker
```

- [ ] **Step 3: Write `images/k8s-env/Dockerfile`**

```dockerfile
FROM docker:27-dind
ARG KIND_VERSION=v0.30.0
ARG KUBECTL_VERSION=v1.35.0
RUN apk add --no-cache bash curl jq yq openssh-client openssl
RUN ARCH=$(uname -m); case "$ARCH" in x86_64) ARCH=amd64 ;; aarch64) ARCH=arm64 ;; esac \
    && curl -fsSL -o /usr/local/bin/kind "https://kind.sigs.k8s.io/dl/${KIND_VERSION}/kind-linux-${ARCH}" \
    && curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${ARCH}/kubectl" \
    && chmod +x /usr/local/bin/kind /usr/local/bin/kubectl
COPY kind-config.yaml bootstrap.sh grade.sh /opt/sim/
COPY start.sh /start.sh
RUN chmod +x /start.sh /opt/sim/bootstrap.sh /opt/sim/grade.sh
ENTRYPOINT ["/start.sh"]
```

(`grade.sh` is added in Task 8 — create an executable placeholder now so the build passes: `printf '#!/usr/bin/env bash\necho "grader not installed yet"; exit 1\n' > images/k8s-env/grade.sh`.)

- [ ] **Step 4: Write `images/k8s-env/start.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
dockerd-entrypoint.sh &
until docker info >/dev/null 2>&1; do sleep 1; done
echo "inner dockerd up"
/opt/sim/bootstrap.sh
echo "k8s-env ready"
tail -f /dev/null
```

- [ ] **Step 5: Write `images/k8s-env/bootstrap.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
BANK=${BANK:?BANK env var required}
BANK_DIR="/banks/${BANK}"
[ -f "${BANK_DIR}/exam.yaml" ] || { echo "no exam.yaml in ${BANK_DIR}"; exit 1; }

rm -f /shared/ready
mkdir -p /shared/ssh
[ -f /shared/ssh/id_ed25519 ] || ssh-keygen -t ed25519 -N '' -f /shared/ssh/id_ed25519 -q

if ! kind get clusters 2>/dev/null | grep -qx sim; then
  kind create cluster --config /opt/sim/kind-config.yaml --wait 180s
fi
kind get kubeconfig --name sim | sed 's#https://0\.0\.0\.0:6443#https://k8s-env:6443#' > /shared/kubeconfig
kind export kubeconfig --name sim   # local admin access via ~/.kube/config
kubectl wait --for=condition=Ready nodes --all --timeout=180s

for qid in $(yq -r '.spec.questions[].id' "${BANK_DIR}/exam.yaml"); do
  echo "seeding ${qid}"
  bash "${BANK_DIR}/${qid}/setup.sh"
done

touch /shared/ready
```

- [ ] **Step 6: Build and boot-test standalone**

```bash
docker build -t sim-k8s-env:dev images/k8s-env
docker volume create sim-shared-test
docker run -d --name k8s-env --hostname k8s-env --privileged \
  -e BANK=ckad-mock-01 \
  -v sim-shared-test:/shared -v "$PWD/banks":/banks:ro sim-k8s-env:dev
# first boot pulls the node image — allow up to ~10 min
timeout 600 bash -c 'until docker exec k8s-env test -f /shared/ready 2>/dev/null; do sleep 10; echo -n .; done'
docker exec k8s-env kubectl get nodes
docker exec k8s-env kubectl get ns aurora-web borealis-api nova orbit
docker rm -f k8s-env && docker volume rm sim-shared-test
```

Expected: 2 nodes (`sim-control-plane`, `sim-worker`) Ready; all seeded namespaces present.

- [ ] **Step 7: Commit**

```bash
git add images/k8s-env && git commit -m "feat(images): k8s-env DinD image with KIND bootstrap and bank seeding"
```

---

### Task 7: Compose stack + `./sim` wrapper

**Files:**
- Create: `docker-compose.yaml`, `sim` (executable)

**Interfaces:**
- Consumes: images from Tasks 5–6.
- Produces: `./sim up|down|purge|ssh|status` used by Task 9 and the README; compose service names `ckad-1`/`ckad-2` matching `exam.yaml`.

- [ ] **Step 1: Write `docker-compose.yaml`**

```yaml
name: kubestronaut-sim
services:
  k8s-env:
    build: images/k8s-env
    hostname: k8s-env
    privileged: true
    environment:
      BANK: ${BANK:-ckad-mock-01}
    volumes:
      - shared:/shared
      - dind:/var/lib/docker
      - ./banks:/banks:ro
    healthcheck:
      test: ["CMD", "test", "-f", "/shared/ready"]
      interval: 10s
      timeout: 3s
      retries: 90
      start_period: 60s
  ckad-1:
    build: images/instance
    hostname: ckad-1
    depends_on:
      k8s-env: {condition: service_healthy}
    volumes:
      - shared:/shared:ro
      - ./banks:/banks:ro
      - ./tests:/tests:ro
  ckad-2:
    build: images/instance
    hostname: ckad-2
    depends_on:
      k8s-env: {condition: service_healthy}
    volumes:
      - shared:/shared:ro
      - ./banks:/banks:ro
      - ./tests:/tests:ro
volumes:
  shared: {}
  dind: {}
```

- [ ] **Step 2: Write `sim`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
cmd=${1:-help}
case "$cmd" in
  up)
    BANK=${2:-ckad-mock-01} docker compose up -d --build --wait
    echo "Exam environment ready. Connect: ./sim ssh ckad-1" ;;
  down)  docker compose down ;;
  purge) docker compose down -v ;;
  ssh)   docker compose exec -it "${2:-ckad-1}" su - candidate ;;
  status) docker compose ps ;;
  grade) docker compose exec k8s-env /opt/sim/grade.sh ;;
  *) echo "usage: ./sim {up [bank]|down|purge|ssh [instance]|status|grade}"; exit 1 ;;
esac
```

- [ ] **Step 3: Bring the stack up and verify manually**

```bash
chmod +x sim
./sim up          # first run: node image pull, expect several minutes
./sim status      # all three services running, k8s-env healthy
./sim ssh ckad-1  # then inside: k get nodes && exit
./sim down
```

Expected: `kubectl get nodes` as candidate shows 2 Ready nodes (API reachable at k8s-env:6443).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yaml sim && git commit -m "feat: compose stack and ./sim wrapper"
```

---

### Task 8: Grader

**Files:**
- Modify: `images/k8s-env/grade.sh` (replace the Task 6 placeholder)

**Interfaces:**
- Consumes: `exam.yaml` question list, validate-script contract (`# points:` / `# desc:` headers), root ssh to instances with `/shared/ssh/id_ed25519`.
- Produces: human scoreboard on stdout ending with the machine-readable line `RESULT <earned> <total> <percent>` (parsed by the smoke test now, by the Go evaluator's tests later). Exit 0 always (score ≠ failure).

- [ ] **Step 1: Write `images/k8s-env/grade.sh`**

```bash
#!/usr/bin/env bash
set -uo pipefail
BANK=${BANK:?}
BANK_DIR="/banks/${BANK}"
SSH="ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o BatchMode=yes -o ConnectTimeout=10 -i /shared/ssh/id_ed25519"
earned=0; total=0
echo "=== ${BANK} results ==="
for qid in $(yq -r '.spec.questions[].id' "${BANK_DIR}/exam.yaml"); do
  instance=$(yq -r ".spec.questions[] | select(.id == \"${qid}\") | .instance" "${BANK_DIR}/exam.yaml")
  echo ""
  echo "-- ${qid} (on ${instance})"
  for script in "${BANK_DIR}/${qid}"/validate.d/*.sh; do
    pts=$(sed -n 's/^# points: //p' "$script" | head -1)
    desc=$(sed -n 's/^# desc: //p' "$script" | head -1)
    case "$pts" in (''|*[!0-9]*) echo "  [SKIP] $(basename "$script"): bad '# points:' header"; continue ;; esac
    total=$((total + pts))
    msg=$($SSH "root@${instance}" \
      "KUBECONFIG=/home/candidate/.kube/config bash /banks/${BANK}/${qid}/validate.d/$(basename "$script")" 2>&1)
    if [ $? -eq 0 ]; then
      earned=$((earned + pts))
      printf '  [PASS] %s (%s pts) — %s\n' "$desc" "$pts" "$msg"
    else
      printf '  [FAIL] %s (0/%s pts) — %s\n' "$desc" "$pts" "$msg"
    fi
  done
done
pct=$(( total > 0 ? earned * 100 / total : 0 ))
echo ""
echo "=== Score: ${earned}/${total} (${pct}%) ==="
echo "RESULT ${earned} ${total} ${pct}"
exit 0
```

- [ ] **Step 2: Rebuild and grade the untouched environment (expect 0)**

```bash
./sim up
./sim grade | tee /tmp/grade-before.txt
grep -q '^RESULT 0 17 0$' /tmp/grade-before.txt && echo GRADE-ZERO-OK
```

Expected: every check `[FAIL]`, then `GRADE-ZERO-OK`. Total 17 = summed check points (q01: 2+1+2=5, q02: 1+2+2+1+1=7, q03: 1+2+2=5).

- [ ] **Step 3: Commit**

```bash
git add images/k8s-env/grade.sh && git commit -m "feat: ssh-based grader with per-check scoreboard"
```

---

### Task 9: End-to-end smoke test + README quickstart

**Files:**
- Create: `tests/smoke.sh`
- Modify: `README.md`

**Interfaces:**
- Consumes: `./sim`, `tests/solutions/q0{1..3}.sh`, grader `RESULT` line.

- [ ] **Step 1: Write `tests/smoke.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "SMOKE FAIL: $1"; ./sim down; exit 1; }

./sim up
docker compose exec ckad-1 su - candidate -c 'kubectl get nodes --no-headers' | tee /tmp/nodes.txt
[ "$(grep -c ' Ready ' /tmp/nodes.txt)" -eq 2 ] || fail "expected 2 Ready nodes"

./sim grade | tee /tmp/grade0.txt
read -r _ e0 t0 _ < <(grep '^RESULT ' /tmp/grade0.txt)
[ "$e0" = "0" ] || fail "fresh env should score 0, got ${e0}"

docker compose exec ckad-1 su - candidate -c 'bash /tests/solutions/q01.sh'
docker compose exec ckad-1 su - candidate -c 'bash /tests/solutions/q02.sh'
docker compose exec ckad-2 su - candidate -c 'bash /tests/solutions/q03.sh'

./sim grade | tee /tmp/grade1.txt
read -r _ e1 t1 _ < <(grep '^RESULT ' /tmp/grade1.txt)
[ "$e1" = "$t1" ] || fail "solved env should score ${t1}/${t1}, got ${e1}/${t1}"

./sim down
echo "SMOKE PASS (${e1}/${t1} after solutions, 0/${t0} before)"
```

- [ ] **Step 2: Run it**

```bash
chmod +x tests/smoke.sh
./tests/smoke.sh
```

Expected final line: `SMOKE PASS (17/17 after solutions, 0/17 before)`. Debug any failing check by running the validate script manually on the instance before touching content.

- [ ] **Step 3: Add quickstart to `README.md`** (append)

```markdown
## Quickstart (Milestone A — CLI exam)

Requires Docker Desktop (or docker + compose v2). ~8GB RAM free.

    ./sim up                 # boots cluster + instances (first run: several minutes)
    cat banks/ckad-mock-01/q01/question.md
    ./sim ssh ckad-1         # solve it (user: candidate)
    ./sim grade              # killer.sh-style scoreboard
    ./sim down               # stop (cluster images cached in a volume)
    ./sim purge              # stop and delete all volumes

Solutions: `banks/ckad-mock-01/<q>/solution.md`.
```

- [ ] **Step 4: Commit**

```bash
git add tests/smoke.sh README.md && git commit -m "test: e2e smoke test; docs: quickstart"
```

---

## Follow-up plans (not this document)

- **Milestone B:** `desktop` image (XFCE + TigerVNC + noVNC, Firefox behind docs-allowlist proxy) joining the compose stack.
- **Milestone C:** Go facilitator (session/timer API) + Go evaluator replacing `grade.sh` (same `RESULT` contract), React UI with embedded noVNC + score page.
- **Milestone D:** bank grows to 6+ questions, `./sim` preflight polish, GitHub Actions (build images → GHCR, smoke job), CONTRIBUTING guide for community questions.
