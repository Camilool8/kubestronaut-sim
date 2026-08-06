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
| `site/` | The GitHub Pages landing page. Published verbatim on push to `main`. |
| `docs/` | The HTTP API and question-bank references. |

## Before you push

Run the five offline gates and the unit tests. They need no Docker and
take seconds:

```bash
tests/bank-weights.sh && tests/check-lint.sh && tests/check-lib.sh \
  && tests/bank-hints.sh && tests/bank-mcq.sh
for m in conductor facilitator proxy hub; do (cd $m && go test ./... && go vet ./...); done
(cd ui && npm ci && npx tsc --noEmit && npm run lint && npm test)
```

| Gate | What it proves |
|---|---|
| `bank-weights.sh` | Each question's `weight:` equals the sum of its `# points:` headers, `exam.yaml` and the `q*/` directories agree, and the domain balance matches the curriculum |
| `check-lint.sh` | No validator grades spelling instead of behaviour, and every check carries an exact `# points: N` header |
| `check-lib.sh` | The `banks/_lib/checks.sh` helpers still treat `0.1` and `100m`, or `1Gi` and `1024Mi`, as the same answer |
| `bank-hints.sh` | Every hinted question has both tiers, and no hint shares 120 consecutive characters with its solution |
| `bank-mcq.sh` | Six invariants over every `examType: mcq` bank, including a non-degenerate answer key |

If you touched `site/`, also run `bash site/build.sh --check`. It
regenerates the mirrors and fails if one is stale, re-derives the page's
figures from `banks/*/exam.yaml`, and compares the certification marks
against `ui/src/components/CertMark.tsx`.

CI runs all of these on every push, plus the eight image builds and a
shell syntax pass. It does **not** run `tests/smoke.sh`, which means the
two gates that keep the banks honest — a fresh environment must score 0,
and the reference solutions must score 100% — are never enforced by
machine. `tests/smoke.sh` is destructive (it purges every volume first),
needs Docker and ~9GB of RAM, and takes about 35 minutes. Run it by hand
for any change to `sim`, `images/`, `docker-compose.yaml` or a validator,
and before a release.

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

**`facilitator/internal/web/dist/index.html` and
`hub/internal/web/dist/index.html` are tracked on purpose.** Both
services serve the UI from `//go:embed all:dist`, and the embed fails to
compile if that directory is empty. The real Vite output overwrites the
stub at image build time and must never be committed. If you build
locally into either path, `git checkout` the stub before committing —
`.gitignore` cannot protect a file that is already tracked.

**Building Go in a container needs `GOFLAGS=-buildvcs=false`**, because
a bind-mounted `.git` has the wrong ownership:

```bash
docker run --rm -e GOFLAGS=-buildvcs=false -v "$PWD/facilitator":/w -w /w golang:1.24 go test ./...
```

**Do not "fix" `await import("node:" + "fs")` in
`ui/src/test/readCss.ts`.** The concatenation is deliberate: there is no
`@types/node` here, and `tsc` resolves a dynamic `import()` against
installed types only when its argument is a string *literal*. Rewriting
it as a static import breaks `npx tsc --noEmit`.

**A value duplicated outside `ui/src/styles/tokens.css` is a mirror, and
every mirror needs something holding it equal.** Three exist:
`site/tokens.css` and `site/favicon.svg` (regenerated by
`site/build.sh`, so re-run it after any token change or CI fails), and
the exam terminal's palette in `images/desktop/assets/` (enforced by
`ui/src/styles/mirrors.test.ts`).

**`site/og.png` is not regenerated by anything.** It is the 1200×630
card every scraper shows for a link to the site, rendered from
`site/og.html` so it cannot advertise a design the page does not have.
Regenerate it after changing `og.html`, `site/styles.css` or the tokens:

```bash
python3 -m http.server 8099 -d site &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars --force-color-profile=srgb \
  --screenshot=site/og.png --window-size=1200,630 \
  http://localhost:8099/og.html
```

`--window-size`, the `.og` rule in `og.html`, and the
`og:image:width` / `og:image:height` in `site/index.html` must all agree.

## Rules that are not negotiable

**No third-party exam dump may ever be committed to this repository**,
not even temporarily. The banks are licensed CC BY-SA 4.0, which
requires them to be ours to license. `.gitignore` bans every `.txt`
under `banks/` for this reason: a bank is YAML, Markdown and shell, so a
`.txt` there is foreign material by definition. `git status` will not
show one, and an ignore rule cannot protect against `git add -f`.

**Two image tags must stay absent from `images/k8s-env/preload.txt`:**
`nginx:1.99` and `nginx:0.0.0-corvus-nonexistent`. Question 02's broken
image and question 11's failing Helm install are both built on those tags
*not* resolving. Preloading them would break two questions silently, and
only a smoke run on a cold cache would notice.

**All user-facing copy belongs in `ui/src/strings.ts`.**

**Every surface that names a certification carries the non-affiliation
notice.** See the bottom of [README.md](README.md).

**A bank that cannot produce a meaningful score is not offered at all.**
A certification with too few questions belongs in the catalog as coming
soon, not in the exam list looking like a sitting.

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
