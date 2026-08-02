# Testing

Four gates run offline in seconds. Three toolchain suites need Go or
Node and no Docker. One end-to-end suite needs Docker, ~9GB of RAM and
about 35 minutes, and is the only place the question banks are ever
proved honest.

CI runs everything except the last one. Read
[What CI does not check](#what-ci-does-not-check) before you rely on a
green check mark.

## Before you push

| Touched | Run |
|---|---|
| `banks/` | The four offline gates |
| `conductor/`, `facilitator/`, `proxy/` | `go test ./... && go vet ./...` in that module |
| `ui/` | `npx tsc --noEmit`, `npm run lint`, `npm test`, from `ui/` |
| `sim`, `images/`, `docker-compose.yml`, or any validator | The smoke suite, on a machine with Docker |

## The offline gates

Four scripts, seconds in total, no cluster and no containers. Run all
four from the repo root:

```bash
bash tests/bank-weights.sh && bash tests/check-lint.sh \
  && bash tests/check-lib.sh && bash tests/bank-hints.sh
```

| Script | What it proves |
|---|---|
| `tests/bank-weights.sh` | Each question's `weight:` equals the sum of its `# points:` headers, and `exam.yaml` and the `q*/` directories list the same questions (header at tests/bank-weights.sh:7-17). The balance check has two modes, matching `tests/bank-mcq.sh`: for an unpooled bank, each domain's share of the points must sit within 2 percentage points of its `spec.domainWeights` entry — the bank IS the exam. For a pooled one (`spec.examLength` smaller than the pool), it instead requires each domain's pool to be deep enough for the per-domain count a stratified draw of that size needs; the pool's own ratio is free to differ, because every draw is stratified to the target regardless. |
| `tests/check-lint.sh` | No validator grades spelling instead of behaviour: no `diff`, no `grep` over YAML, no `kubectl get -o yaml`, no `kubectl run`, no `grep -qx`. It also requires an exact `# points: N` header on every check and refuses a call into `banks/_lib/checks.sh` that never sourced it. |
| `tests/check-lib.sh` | The `banks/_lib/checks.sh` helpers still treat `0.1` and `100m` as the same CPU request, `1Gi` and `1024Mi` as the same memory, and a trailing space as the same answer. |
| `tests/bank-hints.sh` | Every question in a bank that has hints has both tiers, and no hint shares 120 consecutive characters with its `solution.md` — a hint you can paste is the solution wearing a hint's name. |

The bank format these enforce is specified in
[docs/bank-spec.md](bank-spec.md).

### Suppressing a check-lint rule

Add `# lint: allow-<rule>` to the offending line, using the rule name
the report prints in brackets (tests/check-lint.sh:15). This works for
the pattern rules only — `diff`, `grep-yaml`, `get-yaml`,
`kubectl-run`, `grep-qx` and `index`. The `points` and
`unsourced-helper` rules have no opt-out, because both mean the grader
will silently score a correct answer as failed.

```bash
name=$(kubectl -n ex get pod -o jsonpath='{.items[0].metadata.name}')  # lint: allow-index
```

## Go tests

Three independent modules, each with its own `go.mod`, Go 1.24, and no
external dependencies — none of them has a `go.sum`. Docker is not
required:

```bash
cd facilitator && go test ./... && go vet ./...
```

| Module | What it is |
|---|---|
| `facilitator/` | The HTTP API, the session state machine, grading, and the embedded UI |
| `conductor/` | The Docker-socket sidecar that rebuilds the cluster and switches banks |
| `proxy/` | The documentation allowlist proxy the exam desktop browses through |

Without a host Go toolchain, run the same commands in a container:

```bash
docker run --rm -v "$PWD/facilitator":/w -w /w \
  -e GOFLAGS=-buildvcs=false golang:1.24 \
  sh -c 'go test ./... && go vet ./...'
```

Set `GOFLAGS=-buildvcs=false` whenever a module is built over a bind
mount: the `.git` directory's owner does not match the build user, git
refuses the repository, and the VCS stamp fails the build. CI sets the
same flag for the same reason (.github/workflows/ci.yml:58-64).

`facilitator` needs `facilitator/internal/web/dist/index.html` to
exist before it will compile, because `//go:embed all:dist` fails on an
empty directory. That stub is tracked on purpose and the real Vite
output overwrites it at image build time, so check it back out if a
local build has replaced it (.gitignore:13-21).

## UI tests

Run every npm and vitest command from `ui/`, never the repo root. From
the root vitest misses `ui/vite.config.ts` and every DOM test fails
with `document is not defined` (.github/workflows/ci.yml:77-79).

```bash
cd ui
npm ci
npx tsc --noEmit
npm run lint
npm test
```

| Rule | Reason |
|---|---|
| Regenerate `ui/package-lock.json` inside `node:22-alpine`, never with host npm | Host npm resolves differently and the image's `npm ci` then breaks (facilitator/Dockerfile:1) |
| Do not upgrade vitest past v2 | It is pinned for vite 5 compatibility (ui/package.json:38-39) |
| Keep `npm run lint` at zero errors and no new warnings | One warning is pre-existing; do not fix it as drive-by work and do not add to it |
| `npm run dev` needs a facilitator already on :8080 | `ui/vite.config.ts:17-25` proxies `/api` and the `/desktop` websocket there, so run `./sim up` first |

Regenerate the lockfile like this:

```bash
docker run --rm -v "$PWD/ui":/w -w /w node:22-alpine npm install
```

## The smoke suite

`tests/smoke.sh` is destructive. It runs `./sim purge` before anything
else (tests/smoke.sh:35), so every volume and the whole cluster are
deleted — never run it against an environment holding an attempt you
want. It needs Docker, ~9GB of free RAM, and about 35 minutes.

```bash
bash tests/smoke.sh
```

It starts with the four offline gates, so a mis-weighted bank fails in
two seconds rather than forty minutes in. `SMOKE_BOOT_BUDGET` bounds
the cold boot and defaults to 3600 seconds (tests/smoke.sh:42).

| What it covers | Where |
|---|---|
| Cold boot reaching `/api/boot` state `ready`, with two Ready nodes | tests/smoke.sh:44-60 |
| Calico installed and kindnet gone, plus a behavioural check that a default-deny NetworkPolicy really blocks traffic | tests/smoke.sh:62-102 |
| ingress-nginx ready on the control-plane node, the `sim` helm repo, the exam registry | tests/smoke.sh:104-120 |
| The podman build, push and run loop against `registry:5000` on instance-1 | tests/smoke.sh:125-138 |
| An Ingress answering on the published host port 8081 | tests/smoke.sh:140-172 |
| Published ports binding 0.0.0.0 by default, the `SIM_BIND` contract | tests/smoke.sh:175-181 |
| Facilitator healthz, exam metadata, built UI assets, the desktop 403 while idle, and noVNC not published to the host | tests/smoke.sh:183-208 |
| The docs-proxy allowlist: `kubernetes.io` and `code.jquery.com` allowed, `example.com`, analytics and open web search blocked, no direct egress from the desktop | tests/smoke.sh:210-231 |
| The conductor unreachable from the host and the desktop, reachable only through `/api/control/*` | tests/smoke.sh:240-248 |
| Session lifecycle: start, a countdown that decreases, desktop unlock, submit, results polling, and the solution and desktop gates re-locking | tests/smoke.sh:250-416 |
| Solving all 22 questions of ckad-mock-01, each on the instance its `exam.yaml` entry names | tests/smoke.sh:331-356 |
| Warm restart keeping the score, and `./sim reset` returning it to 0 with `/opt/course` re-created empty | tests/smoke.sh:418-440 |
| A bank round trip, CKAD to the hidden `smoke-01` fixture and back, including its one question and the fixture staying out of the exam selector's list | tests/smoke.sh:442-538 |
| Switching to a coming-soon certification refused with 400 | tests/smoke.sh:470-473 |
| A bank id or question id that is not a slug refused with 400, so neither reaches a filesystem path | tests/smoke.sh:476, tests/smoke.sh:582 |
| Training mode: hint tiers served one at a time, solutions readable mid-attempt, a practice grade that never becomes a result — and every one of those endpoints 403 in an exam attempt | tests/smoke.sh:540-602 |
| A session expiring unattended and re-locking the desktop | tests/smoke.sh:604-626 |

CKA is covered only as an assertion that switching to it is refused.
The round trip runs through `smoke-01`, which has one question and
therefore reseeds in seconds.

## The two bank-honesty gates

| Gate | Where |
|---|---|
| A fresh environment scores 0 | tests/smoke.sh:271-273, :434, :522, :538 |
| Every `tests/solutions/<bank>/qNN.sh` scores 100% | tests/smoke.sh:352-356 |

The fresh-scores-0 gate is the load-bearing one. It is what catches a
check that passes by accident or against state a previous attempt left
behind — and the 100% gate cannot catch either, because a check that
always passes passes there too.

Both run only inside `tests/smoke.sh`, so neither is ever enforced by a
machine.

## What CI runs

`.github/workflows/ci.yml` runs five jobs on push to every branch, on
every pull request, and on manual dispatch.

| Job | What it runs |
|---|---|
| `banks` | The four offline gates |
| `go` | `go test ./...` then `go vet ./...` for `facilitator`, `conductor` and `proxy`, in a matrix with `fail-fast: false` |
| `ui` | `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npm test`, all with `working-directory: ui` |
| `images` | Builds all six Dockerfiles with `PRELOAD=none`, then `docker compose config -q` |
| `shell` | `bash -n` over `sim`, `tests/*.sh`, image entrypoints, `banks/_lib/*.sh`, every `setup.sh` and `validate.d/*.sh`, and every solution script |

`PRELOAD=none` skips baking ~2GB of image archives. The job proves the
Dockerfiles parse and build; only a real boot proves the archives are
right, and that is the smoke suite's job.

## What CI does not check

| Not checked | What that means |
|---|---|
| `tests/smoke.sh` | Excluded on purpose (.github/workflows/ci.yml:9-11). Nothing end-to-end runs in CI, so both bank-honesty gates are never machine-enforced |
| `gofmt` | Only `go vet` runs, so a misformatted Go file merges clean |
| `go test -race` | Races in the facilitator's session state surface at runtime, not on a pull request |
| Coverage | No report and no threshold |
| `shellcheck` | Only `bash -n`, which proves a script parses and nothing more, across 76 validator scripts |
| `govulncheck`, `npm audit` | No dependency advisories on either toolchain |
| Dependabot, code scanning | `.github/` holds one workflow and nothing else |

A green CI run means the code compiles, the types check, the unit tests
pass and the banks are internally consistent. It does not mean a single
validator has been run against a cluster.

Before a release, run `bash tests/smoke.sh` by hand on a machine with
Docker — it is the only thing that grades a real cluster, and the only
place the bank-honesty gates exist.
