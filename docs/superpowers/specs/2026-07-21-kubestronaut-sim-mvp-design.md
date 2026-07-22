# Open-Source Kubestronaut Exam Simulator — MVP: CKAD Practical Environment

## Context

Camilo wants an open-source, killer.sh-style exam simulator covering all Kubestronaut exams (KCNA, CKAD, CKA, CKS, KCSA), with two distributions: a self-hosted/local version users bootstrap on their machines, and a hosted version on his own infrastructure (GitHub OAuth + consent/newsletter for future marketing). Questions will be original, community-inspired, and deliberately harder than the real exams.

Decisions made during brainstorming:

- **MVP = the CKAD practical environment, local-first** (remote desktop, docs-restricted browser, terminal, bootstrapped cluster, timer, automated scoring). Theory engine (KCNA) and hosted platform are later milestones with their own specs.
- **Clean-room build, not a CK-X fork.** CK-X (github.com/sailor-sh/CK-X) is BSL 1.1 — forking would block both true open source and future monetization. Use it only as an architectural reference. License our code **Apache-2.0**; question banks **CC BY-SA 4.0**.
- **Legal constraint:** `killer-sh-ckad-dump.txt` is copyrighted killer.sh content. Use it only as a reference for question *format, difficulty style, and scoring UX* (per-question checks, `/opt/course/N/...` artifact paths, ssh-per-instance model). All published questions must be original.
- **Stack: Go** (facilitator API, evaluator, orchestration) + **React/TypeScript** UI.
- **Session architecture: modular Docker Compose stack** — separate containers per concern, so the same images can later run as per-candidate pods in the hosted version.

Working repo name: `kubestronaut-sim` (rename freely). Create as a new repo under `/Users/cjoga/Labs/`.

## Architecture (MVP)

```
docker compose up
┌──────────────────────────────────────────────────────────────┐
│ facilitator (Go) :8080 — serves React UI + REST API          │
│   • exam catalog, session lifecycle, timer, triggers eval    │
│   • UI embeds noVNC iframe pointed at desktop container      │
│ desktop — XFCE + TigerVNC + noVNC/websockify                 │
│   • Firefox → forward-proxy (allowlist: kubernetes.io,       │
│     helm.sh only) — mimics real exam docs restriction        │
│   • xfce4-terminal; candidate ssh's to instance containers   │
│ instances — 2–3 light ssh-target containers (candidate env)  │
│   • each has kubectl/helm + kubeconfig for its cluster ctx   │
│ k8s-env — DinD container running a 2-node KIND cluster       │
│   • host Docker stays clean; setup scripts seed pre-state    │
│ evaluator (Go) — runs question validate scripts, emits JSON  │
└──────────────────────────────────────────────────────────────┘
```

## Components

### 1. Question bank spec (the contract everything consumes)

`banks/ckad-mock-01/exam.yaml`: exam metadata — title, duration (120m), passing %, cluster topology, instance list, question index with weights and CKAD domain tags.

Per question directory `banks/ckad-mock-01/q01/`:
- `question.md` — statement (killer.sh tone: team/namespace flavor, artifact paths like `/opt/course/1/...`, target instance)
- `setup.sh` — idempotent pre-state seeding (namespaces, existing objects, broken resources) run against the cluster at session start
- `validate.d/*.sh` — one script per scoring criterion; exit 0 = pass, stdout = message; points declared in a small header or sidecar `checks.yaml`
- `solution.md` — full walkthrough shown on the score page

Seed content: **~6 original questions** for the first bank, inspired by the dump's coverage (namespaces, pods, jobs, probes, deployments/rollouts, networkpolicy) but rewritten and harder.

### 2. `k8s-env` (environment provider)

DinD image that creates the KIND cluster (2 nodes, pinned k8s version from `exam.yaml`) on boot, writes kubeconfigs to a shared volume, then runs the bank's setup scripts. Design as a provider interface (KIND first) so CKA/CKS node-level environments can be added later without touching the facilitator.

### 3. `desktop` image

XFCE + TigerVNC + noVNC. Firefox locked via `policies.json` + a tiny Go forward-proxy sidecar allowlisting `kubernetes.io`, `helm.sh` (and subdomains). Default terminal profile with motd explaining the ssh-instance model. SSH client config pre-wired to instance containers (`ssh ckad-1` etc.).

### 4. `instances`

Small SSH-server image (openssh + kubectl + helm + vim/nano + jq/yq), one container per instance name in `exam.yaml`, mounting its kubeconfig from the shared volume. This reproduces killer.sh's "solve this question on instance X" flow.

### 5. Facilitator (Go)

REST API: `GET /api/exam`, `POST /api/session/start`, `GET /api/session` (remaining time, state), `POST /api/session/end` → runs evaluator → `GET /api/results`. Session state in a JSON file/SQLite volume (survives restarts). Serves the built React app. Auto-ends session at 0:00.

### 6. Evaluator (Go)

Executes each question's `validate.d/` scripts inside a container with admin kubeconfig + ssh access to instances (checks both cluster state and files written on instances, like the real thing). Output: per-question, per-check pass/fail + points → JSON consumed by the score page.

### 7. UI (React/TS)

Killer.sh-style layout: start screen with exam tips → exam view (top timer bar, left question list/panel with markdown rendering, main noVNC iframe) → score page (total %, per-question expandable checks, solutions). Dark terminal-friendly theme.

### 8. Bootstrap UX

MVP: `git clone` + `./sim up ckad-mock-01` (thin bash wrapper over `docker compose`: preflight checks docker/compose/resources, brings stack up, waits healthy, opens browser). A proper Go CLI can replace it in a later milestone.

## Implementation order

1. Repo scaffold, licenses, question-spec docs + `ckad-mock-01` bank (6 questions) — the contract first
2. `k8s-env` DinD + KIND + setup-script runner + `instances` image; smoke test: ssh in, kubectl works, pre-state present
3. `desktop` image with noVNC + proxy-restricted Firefox
4. Facilitator API (session, timer) serving a minimal UI with embedded noVNC
5. Evaluator + score page wired end-to-end
6. UI polish, `./sim` wrapper, README/quickstart, GitHub Actions to build/push images (GHCR)

## Verification

- `./sim up ckad-mock-01` on macOS (Docker Desktop): stack healthy, UI at `localhost:8080`, desktop reachable, Firefox blocked from non-docs sites, `ssh ckad-1` works with seeded pre-state.
- Scoring correctness: for each question, run (a) untouched cluster → 0 points, (b) scripted correct solution → full points, (c) partial solution → partial credit. Automate as an e2e test that execs the solution into the instance and asserts evaluator JSON.
- Timer: session auto-ends and locks the desktop iframe at expiry.
- CI smoke job: compose up on ubuntu runner, curl health endpoints, run one question's solve+evaluate cycle.

## Later milestones (separate specs, not in this MVP)

- **KCNA theory engine**: timed MCQ web app reusing the facilitator/UI shell; theory question spec added to the bank format.
- **Hosted version**: k8s operator/provisioner spawning per-candidate stacks (same images; vcluster or KIND-in-pod), GitHub OAuth, explicit consent checkbox + email capture (e.g., Listmonk for newsletters), session TTL/cleanup, TLS.
- **CKA/CKS environment provider**: kubeadm-based nodes (needed for upgrades, etcd backup, node security tasks) behind the same provider interface.
- Community contribution guide for question banks; difficulty ratings; exam variants/randomization.
