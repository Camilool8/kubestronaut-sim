# kubestronaut-sim

An exam simulator for the Kubestronaut certifications, run locally as a
Docker Compose stack.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing anything. Its
"Things that will bite you" and "Rules that are not negotiable"
sections are the parts that cost an afternoon if skipped, and they are
not repeated here.

## Commands

`./sim` is the runtime task runner, not a dev task runner. There is no
Makefile; the commands below are what CI runs
(`.github/workflows/ci.yml`).

| Task | Command | From |
|---|---|---|
| Run the stack | `./sim up` | repo root |
| Stop it | `./sim down` | repo root |
| Bank gates | `tests/bank-weights.sh && tests/check-lint.sh && tests/check-lib.sh && tests/bank-hints.sh && tests/bank-mcq.sh` | repo root |
| Landing page | `site/build.sh --check` | repo root |
| Go tests | `for m in conductor facilitator proxy; do (cd $m && go test ./... && go vet ./...); done` | repo root |
| UI tests | `npm ci && npx tsc --noEmit && npm run lint && npm test` | **`ui/`** |
| Smoke suite | `tests/smoke.sh` | repo root |

The bank gates, the Go tests and the UI tests need no Docker and take
seconds. Run them before pushing.

`tests/smoke.sh` is the only check that a fresh environment scores 0 and
the reference solutions score 100%. **CI cannot run it.** Run it by hand
for any change that could affect grading or the environment.

## Layout

| Path | Contains |
|---|---|
| `sim` | The only task runner. Runtime commands, not dev commands |
| `conductor/` | Go service. Owns the Docker socket; rebuilds the cluster |
| `facilitator/` | Go service. Sessions, grading, the HTTP API, serves the UI |
| `proxy/` | Go service. The documentation allowlist, run as `docs-proxy` |
| `ui/` | React + Vite front end |
| `images/` | Dockerfiles for the desktop, the instances, and the cluster host |
| `banks/` | Question banks, the shared validator library, and Helm charts |
| `tests/` | The offline bank gates, the smoke suite, and reference solutions |
| `docs/` | Reference and explanation. Start at [docs/README.md](docs/README.md) |

## Conventions

- Commit subjects: `type: what changed` or `type(scope): what changed`,
  lower case, no trailing period. Types in use: `feat`, `fix`, `docs`,
  `copy`, `test`, `chore`, `bank`.
- All user-facing copy belongs in `ui/src/strings.ts`.
- `docs/history/` is frozen. It is not maintained, and where it
  disagrees with the code the code is right. Do not update it.
- Question banks are data with a schema — see
  [docs/bank-spec.md](docs/bank-spec.md), not doc conventions.

## Gotchas

Full list in [CONTRIBUTING.md](CONTRIBUTING.md#things-that-will-bite-you).
The three that most often catch an agent:

- **Run every npm command from `ui/`, never the repo root.** From the
  root, every DOM test dies with `document is not defined`.
- **Regenerate `ui/package-lock.json` inside `node:22-alpine`**, never
  with host npm.
- **Building Go in a container needs `GOFLAGS=-buildvcs=false`.**
