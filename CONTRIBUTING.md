# Contributing

## What you need

Docker Desktop (or docker + compose v2), python3, and about 9GB of free
RAM to run the stack. For the code itself: Go 1.24 and Node 22, or
Docker alone if you would rather not install either.

```bash
git clone git@github.com:Camilool8/kubestronaut-sim.git
cd kubestronaut-sim
./sim doctor
./sim up
```

## Repository layout

| Path | What lives there |
|---|---|
| `sim` | The only task runner. Runtime commands, not dev commands. |
| `conductor/` | Go service. Owns the Docker socket; rebuilds the cluster. |
| `facilitator/` | Go service. Sessions, grading, the HTTP API, serves the UI. |
| `proxy/` | Go service. The documentation allowlist, run as `docs-proxy`. |
| `ui/` | React + Vite front end. |
| `images/` | Dockerfiles for the desktop, the instances, and the cluster host. |
| `banks/` | Question banks, the shared validator library, and Helm charts. |
| `tests/` | The five offline gates, the smoke suite, and reference solutions. |
| `docs/` | Reference and explanation. Start at [docs/README.md](docs/README.md). |

## Before you push

Run the five offline gates and the unit tests. They need no Docker and
take seconds:

```bash
tests/bank-weights.sh && tests/check-lint.sh && tests/check-lib.sh \
  && tests/bank-hints.sh && tests/bank-mcq.sh
for m in conductor facilitator proxy hub; do (cd $m && go test ./... && go vet ./...); done
(cd ui && npm ci && npx tsc --noEmit && npm run lint && npm test)
```

CI runs all of these on every push, and three things you cannot run in
seconds: `site/build.sh --check`, the six image builds, and a shell
syntax pass. It does **not** run `tests/smoke.sh`, which means the two
gates that keep the banks honest — a fresh environment must score 0, and
the reference solutions must score 100% — are never enforced by machine.
Run the smoke suite by hand before a release.
[docs/testing.md](docs/testing.md) covers all of this, including what CI
silently does not check.

## Things that will bite you

**Run every npm command from `ui/`, never the repo root.** Vitest
resolves its config relative to the working directory, and from the root
every DOM test dies with `document is not defined`.

**Regenerate `ui/package-lock.json` inside `node:22-alpine`, never with
host npm.** A lockfile written by a different npm breaks the image's
`npm ci`.

```bash
docker run --rm -v "$PWD/ui":/w -w /w node:22-alpine npm install
```

**`npm run dev` needs the stack already running.** `ui/vite.config.ts`
proxies `/api` and the `/desktop` websocket to port 8080, so run
`./sim up` first.

**vitest is pinned to v2** for compatibility with vite 5. Do not bump it
alone.

**`npm run lint` is clean at zero warnings.** `npx eslint src
--max-warnings 0` passes today, so there is no baseline for a new
warning to hide in. Keep it that way.

**The facilitator builds from the repo root**, because its Dockerfile's
Vite stage needs `ui/` in the build context. The conductor and the proxy
build from their own directories.

**`facilitator/internal/web/dist/index.html` is tracked on purpose.**
The facilitator serves the UI from `//go:embed all:dist`, and the embed
fails to compile if that directory is empty. The real Vite output
overwrites it at image build time and must never be committed.
`.gitignore:13-21` has the details.

**Building Go in a container needs `GOFLAGS=-buildvcs=false`**, because
a bind-mounted `.git` has the wrong ownership:

```bash
docker run --rm -e GOFLAGS=-buildvcs=false -v "$PWD/facilitator":/w -w /w golang:1.24 go test ./...
```

## Rules that are not negotiable

**No third-party exam dump may ever be committed to this repository**,
not even temporarily. The banks are licensed CC BY-SA 4.0, which
requires them to be ours to license. `.gitignore` blocks the common
filenames, but an ignore rule cannot protect against `git add -f`.

**All user-facing copy belongs in `ui/src/strings.ts`.** Two files
currently break this rule and should be pulled back in rather than
copied from.

**Every surface that names a certification carries the non-affiliation
notice.** See the bottom of [README.md](README.md).

**A bank that cannot produce a meaningful score is not offered at all.**
A two-question CKA bank was removed rather than left in the catalog
looking like an exam.

## Writing questions

[docs/bank-spec.md](docs/bank-spec.md) is the reference: the `exam.yaml`
schema, the validator contract, the point and domain-weight rules, and
the lint that fails the build on checks that grade spelling instead of
behaviour.

## Commits and pull requests

Commit subjects follow `type: what changed` or `type(scope): what
changed`, in lower case, with no trailing period. Types in use: `feat`,
`fix`, `docs`, `copy`, `test`, `chore`, `bank` — `copy` is for
user-facing wording that changes no behaviour. The scope is the
subsystem, and about half of the history carries one: `ui`, `api`,
`site`, `exam`, `smoke`, `bank-spec`. Write the subject as a phrase a
reader would understand without the diff.

```
fix: behavioural checks that cost 5 points to a stopwatch
bank: derive point budgets from the curriculum instead of assigning them
```

Open a pull request against `main`. Say whether you ran
`tests/smoke.sh`, since CI cannot.
