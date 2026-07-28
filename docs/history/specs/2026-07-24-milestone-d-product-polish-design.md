# Milestone D — Product Polish: UI-driven control plane, exam catalog, design system

Status: in progress (phases 0–4 landed; 5–9 in flight)
Branch: milestone-d

## Goal

After `./sim up`, the user never needs the CLI again. The web UI drives
resets, exam selection/switching, and every session action; the product
feels polished end-to-end (design system, dark+light themes, toasts,
first-run tour, disclaimers); the VNC desktop is ready to work in the
moment it appears.

## Architecture

### Conductor (the only privileged container)

`conductor/` — Go 1.24, stdlib-only + yq (entrypoint pre-converts every
`banks/*/exam.yaml` to JSON, same convention as facilitator/proxy). It
alone mounts `/var/run/docker.sock`, plus `./banks:ro` and `shared` rw.
It lives on `controlnet` (`internal: true`) with exactly one peer: the
facilitator, which reverse-proxies `/api/control/*` to it. No host port;
unreachable from `examnet` (smoke asserts both).

The accepted trade-off: the candidate's browser can reach the control
API through :8080 (candidate == operator on a single-user local tool).
The defended boundary is *privilege* — the docker socket never enters an
exam-facing container — not candidate access.

Internals: `internal/docker` (minimal Engine API client over the unix
socket: find-by-compose-labels, exec with stdcopy demux + exit code,
restart), `internal/job` (single in-flight job with a phase checklist;
409 while busy), `internal/catalog` (bank JSON + `banks/catalog.yaml`
coming-soon merge; availability rules), `internal/control` (the
orchestrations), `internal/api` (HTTP).

### Control API (proxied at :8080/api/control/*)

    GET  /api/control/banks   → {active, banks:[{id,title,certification,
                                 examType,durationSeconds,passingScore,
                                 kubernetesVersion,questionCount,available,
                                 comingSoon?,note?}]}
    GET  /api/control/status  → {busy, job?, lastJob?}   job = {id,op,bank,
                                 startedAt,phase,error?,phases:[{id,label,state}]}
    POST /api/control/reset   → 202 {job} | 409 busy
    POST /api/control/switch  → 202 {job} | 400 invalid bank | 409 busy or
         {bank}                 session running ("end the exam first")

Progress is polled (2s busy / 15s idle in the UI), never streamed: a
switch restarts the facilitator itself, which would sever any SSE.

Job sequences:
- reset: end-session → wipe-instances → recreate-cluster (kind delete +
  bootstrap) → restart instance-1/2 → verify (facilitator healthy).
- switch: + write-bank (`/shared/bank`) after wipe, before the cluster
  rebuild (bootstrap reads it); restart set grows to docs-proxy and
  facilitator (last); verify additionally asserts GET /api/exam name ==
  target bank.

### Runtime bank source

`/shared/bank` supersedes the compose-time `BANK` env everywhere; all
four bank-reading entrypoints resolve the file first, env as first-boot
fallback. k8s-env creates the file on first boot; the conductor is its
only other writer. bootstrap.sh also regenerates `/shared/exam/motd`
(bank title + ssh targets), which the desktop's bashrc prints — the
desktop welcome banner follows the active bank with zero desktop-image
coupling.

### Session identity (v2)

`session.json` version 2 adds `bank` + `attempt` (crypto/rand token
minted by Start). A persisted session from another bank (or a v1 file)
is discarded to idle on load. The grader captures the attempt token when
a run begins; SetResults/SetGradeError reject mismatches — this closes
the milestone-C generation-token residual: attempt A's grade can never
stamp attempt B, even across a full second lifecycle.

### Topology

Compose services renamed `ckad-1/2` → `instance-1/2`; bank spec v1alpha2
constrains `spec.instances[].name` to those (1–2 entries). Banks whose
instances don't conform are listed in the catalog but disabled with a
reason. Coming-soon certifications (KCNA/KCSA mcq, CKS) come from
`banks/catalog.yaml` and render as disabled cards.

## UI

Screen = f(session.state) is preserved (no router). The Lobby (idle)
gains the exam catalog with switch-confirm; Exam unchanged this phase;
Score's dead-end CLI hint became a "New attempt" button. App owns a
`ControlProgress` overlay rendered above any screen whenever a control
job is in flight (or failed and undismissed), with op-aware Retry.

Design direction (phase 5): redesign-preserve. The teal-on-slate
terminal identity stays and becomes a token system with light+dark
themes (`sim.theme` localStorage: system|light|dark); IBM Plex Sans for
prose, JetBrains Mono for timer/code — both self-hosted (offline).
The stock noVNC chrome is replaced by a first-party RFB client
(`@novnc/novnc` core, no vendored UI) so the desktop viewport speaks the
same design language; the Go locked page mirrors the tokens and reads
the same localStorage key inline.

## Verification

`tests/smoke.sh` additions: conductor unreachable from host and desktop;
control status 200 via :8080; CKAD→CKA→CKAD switch round-trip (fresh 0
both directions, cka q01 solved in between, motd follows the bank);
results totals parsed from the grade run instead of hardcoded.

Live-verified during development: UI reset (desktop locks <1s, five
phases, session idle, grade 0) and the full switch round-trip
(CKA 0/10 fresh → 10/10 solved → back to CKAD 0/17 fresh).

## Out of scope (unchanged from milestone C)

Attempt history; auth on the control API; MCQ engine (KCNA/KCSA); CI/
GHCR publishing (milestone E candidates).
