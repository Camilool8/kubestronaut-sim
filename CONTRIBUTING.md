# Contributing

## Setup

**You need:** everything under
[docs/install.md](docs/install.md#prerequisites) to run the stack, and
for the code itself Go 1.26 and Node 22 — or Docker alone. On Windows,
run `sim.ps1` instead of `sim`; install.md has the PowerShell steps.

```bash
git clone git@github.com:Camilool8/kubestronaut-sim.git
cd kubestronaut-sim
./sim doctor
./sim up
```

## Repository layout

| Path | Contains |
|---|---|
| `sim` | The only task runner. Runtime commands, not dev commands |
| `conductor/` | Go service. Owns the Docker socket; rebuilds the cluster |
| `facilitator/` | Go service. Sessions, grading, the HTTP API, serves the UI |
| `hub/` | Go service. Sign-in, seats and history. Hosted deployments only |
| `proxy/` | Go service. The documentation allowlist, run as `docs-proxy` |
| `ui/` | React + Vite front end |
| `images/` | Dockerfiles for the desktop, the instances, the cluster host |
| `banks/` | Question banks, the shared validator library, Helm charts |
| `tests/` | The offline gates, the smoke suite, reference solutions |
| `site/` | The GitHub Pages landing page. Published verbatim on push to `main` |
| `docs/` | HTTP API and question-bank references |

## Before you push

Run these. They need no Docker and take seconds:

```bash
tests/bank-weights.sh && tests/check-lint.sh && tests/check-lib.sh \
  && tests/check-evidence.sh && tests/next-version.sh \
  && tests/bank-hints.sh && tests/bank-mcq.sh && tests/check-shell.sh \
  && tests/check-figures.sh && sh tests/check-preload.sh \
  && bash tests/check-k8s-pins.sh
for m in conductor facilitator proxy hub images/desktop/opener; do (cd $m && go test ./... && go vet ./...); done
(cd ui && npm ci && npx tsc --noEmit && npm run lint && npm test)
```

If you touched `site/`, also run `bash site/build.sh --check`. It diffs
`site/fonts/*.woff2` against `ui/node_modules/@fontsource`, so `npm ci` in
`ui/` has to have run first — with the sources missing the check now fails
instead of quietly skipping that comparison.

If you touched `sim` or `sim.ps1`, also run `bash tests/check-sim-parity.sh`
— the Windows launcher must offer the same nine subcommands, dispatch every
one of them, and exit the same way `./sim` does on argv either would refuse.
It runs both launchers for real, so install PowerShell (`brew install
powershell`) if you want the half that compares behaviour; without it the
gate says out loud that it skipped, and CI sets `PWSH_REQUIRED=1` so it
cannot skip there. `bash tests/check-crlf-repair.sh` is worth running then
too, and honours the same variable — its static half checks the wiring
anywhere, but only a PowerShell can prove `Repair-LineEndings` still
converts CRLF, and a broken extraction once reached CI with every local
gate green precisely because nothing ran it.

### What each gate proves

| Gate | Proves |
|---|---|
| `bank-weights.sh` | Each question's `weight:` equals the sum of its `# points:` headers, `exam.yaml` and the `q*/` directories agree, and the domain balance matches the curriculum. For a bank declaring `spec.difficultyMix`, also that every question's level matches its `targetSeconds` band, that the pool is deep enough per domain and level to hold the mix, and that a drawn attempt fits the clock |
| `check-lint.sh` | No validator grades spelling instead of behaviour, and every check carries an exact `# points: N` header |
| `check-lib.sh` | The `banks/_lib/checks.sh` helpers still treat `0.1` and `100m`, or `1Gi` and `1024Mi`, as the same answer |
| `check-evidence.sh` | Drives real `validate.d` scripts against a stubbed `kubectl` to prove what a **failing** check reports: a failure never arrives without an `actual` pane, and a name the candidate did not use is named, not shown as an empty field. `tests/solutions/` only ever walks the happy path, which is how a check came to report `runAsUser='', want 10001` for a whole release |
| `next-version.sh` | `.github/scripts/next-version.py` computes the release tag from the commit log, so this pins the arithmetic: which prefixes are a patch, that the largest bump wins, and that a breaking change on 0.x is a minor rather than v1.0.0 |
| `bank-hints.sh` | Every hinted question has both tiers, and no hint shares 120 consecutive characters with its solution |
| `bank-mcq.sh` | Six invariants over every `examType: mcq` bank, including a non-degenerate answer key |
| `site/build.sh --check` | The generated mirrors are current, the page's question totals and drawn/pool stats match `banks/*/exam.yaml`, and its cert marks match `CertMark.tsx` |
| `check-figures.sh` | Every other published exam figure — the clock, the passing score, the domain weights, the mode table's per-certification clocks — agrees with the `exam.yaml` that owns it, across `README.md`, `site/index.html`, `docs/api.md` and each bank's own README and tips page. The API samples are parsed rather than grepped, so a neighbouring sample's draw of 10 is never read as this bank's pool. A listable bank that no page states a figure for is a failure rather than a skip, and a pass prints how many comparisons it made |
| `check-preload.sh` | The two image tags two questions depend on *not* resolving are still absent from `images/k8s-env/preload.txt`. It reads that tag list out of the prose under [Rules that are not negotiable](#rules-that-are-not-negotiable) rather than keeping a second copy, and confirms each tag against the question the prose attributes it to — so a wrong question number fails the gate rather than surviving in the document, which is how issue #88 stood until someone corrected it by hand |
| `check-k8s-pins.sh` | The Kubernetes **minor** agrees across every `banks/*/exam.yaml`, `images/k8s-env/Dockerfile` and `images/instance/Dockerfile`. The patch levels differ on purpose and are not compared. A cutover that raises three pins and forgets the fourth builds a cluster whose kubectl, whose node image and whose catalog card disagree, and nothing else in CI notices |
| `check-sim-parity.sh` | `sim` and `sim.ps1` offer the same subcommands, the same usage string, and behave the same. `sim.ps1`'s `switch` arms must match its `$COMMANDS` declaration — a command declared but not dispatched prints nothing and exits 0 — and both launchers must return the same exit code for every row of a shared bad-argv table, including `DOCTOR`/`Purge` and `purge --ALL`, whose case-sensitivity is the contract that keeps `--ALL` from deleting every graded attempt. Both run with a stub `docker`/`curl`/`python3`/`git` first on `PATH` that records any call and exits 97, so a row that reaches docker is reported rather than executed, and the gate is safe to run with an exam live. Without a PowerShell the behaviour half says loudly that it skipped; CI sets `PWSH_REQUIRED=1`, which makes a missing one a failure instead |
| `check-shell.sh` | Every shell script git knows about — not a curated glob, so nothing falls outside it — parses under `bash -n` and passes ShellCheck at **severity `warning`**. `info` and `style` add 63 and 71 findings that are not defects, so the floor sits above them. Without ShellCheck installed the lint pass says loudly that it skipped; CI sets `SHELLCHECK_REQUIRED=1`, which makes a missing binary a failure instead |

### What CI cannot run

CI runs everything above, plus the eight image builds and a Windows job
that runs `sim.ps1` under both Windows PowerShell 5.1 and PowerShell 7.
Its ShellCheck is pinned by version and SHA-256 rather than taken from
the runner image, so a runner bump cannot turn the job red on a pull
request that changed no shell. It does **not** run `tests/smoke.sh`.

That means the two gates keeping the banks honest are never enforced by
machine:

- A fresh environment must score 0.
- The reference solutions must score 100%.

`tests/smoke.sh` is destructive — it purges every volume first — needs
Docker and ~9GB of RAM, and takes about 35 minutes. Run it by hand for
any change to `sim`, `images/`, `docker-compose.yaml` or a validator,
and before a release.

## Things that will bite you

**Run every npm command from `ui/`, never the repo root.** Vitest
resolves its config relative to the working directory; from the root
every DOM test dies with `document is not defined`.

**Regenerate `ui/package-lock.json` inside `node:22-alpine`**, never
with host npm — a lockfile written by a different npm breaks the image's
`npm ci`.

```bash
docker run --rm -v "$PWD/ui":/w -w /w node:22-alpine npm install
```

**`npm run dev` needs the stack already running.** `ui/vite.config.ts`
proxies `/api` and the `/desktop` websocket to port 8080, so run
`./sim up` first.

**vite and vitest are one pin, not two** — `vite ^6.4.3` with
`vitest ^3.2.7`. Vitest runs the tests through Vite's own transform
pipeline, so a major on one needs the matching major on the other.
Bumping either alone breaks the suite.

**`npm run lint` is clean at zero warnings.** Keep it that way.

**The facilitator builds from the repo root**, because its Dockerfile's
Vite stage needs `ui/` in the build context. The conductor and the proxy
build from their own directories.

**Building Go in a container needs `GOFLAGS=-buildvcs=false`**, because
a bind-mounted `.git` has the wrong ownership:

```bash
docker run --rm -e GOFLAGS=-buildvcs=false -v "$PWD/facilitator":/w -w /w golang:1.26 go test ./...
```

**`facilitator/internal/web/dist/index.html` and
`hub/internal/web/dist/index.html` are tracked on purpose.** Both
services serve the UI from `//go:embed all:dist`, which fails to compile
against an empty directory. Vite overwrites the stub at image build
time. If you build locally into either path, `git checkout` the stub
before committing.

**Do not "fix" `await import("node:" + "fs")` in
`ui/src/test/readCss.ts`.** There is no `@types/node` here, and `tsc`
resolves a dynamic `import()` against installed types only when its
argument is a string *literal*. A static import breaks `tsc --noEmit`.

**Every mirror needs something holding it equal.** Three exist:

| Mirror | Held equal by |
|---|---|
| `site/tokens.css` | `site/build.sh` — re-run it after any token change, or CI fails |
| `site/favicon.svg` | `site/build.sh` |
| The exam terminal palette in `images/desktop/assets/` | `ui/src/styles/mirrors.test.ts` |

**`site/og.png` is regenerated by nothing.** It is the 1200×630 card
scrapers show for a link to the site. Regenerate it after changing
`og.html`, `site/styles.css` or the tokens:

```bash
python3 -m http.server 8099 -d site &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars --force-color-profile=srgb \
  --screenshot=site/og.png --window-size=1200,630 \
  http://localhost:8099/og.html
```

`--window-size`, the `.og` rule in `og.html`, and the
`og:image:width` / `og:image:height` in `site/index.html` must agree.

**`site/shots/` is regenerated by nothing either, and nothing can tell
you it has gone stale.** Eight WebP files — four screens in a light and
a dark variant — carry the README and the landing page. `site/build.sh
--check` verifies each one exists, is a readable WebP, is exactly twice
the `width`/`height` its page declares, and that the two halves of a
`<picture>` pair are the same size. It cannot verify that the pixels
still resemble the software. That part is yours.

| Shot | Screen | Captured at |
|---|---|---|
| `exam-*.webp` | A running CKAD attempt, task 01 | 1600×1000 |
| `score-*.webp` | The score screen, scrolled to the top | 1600×1000 |
| `mode-*.webp` | The CKAD mode picker | 1600×1000 |
| `progress-*.webp` | Progress, with more than one attempt recorded | 1600×1040 |

Recapture with Chrome driven by Playwright over CDP, at
`deviceScaleFactor: 2`, one theme per pass:

```js
await page.emulateMedia({ colorScheme: "dark" });   // then "light"
```

**An image in the README takes a `width` and never a `height.`** GitHub's
markdown CSS is `img { max-width: 100% }` with no `height: auto`, and it
strips inline `style`, so a height attribute is honoured literally while
`max-width` shrinks the width — every shot renders about 1.6x too tall.
The landing page sets `height: auto` in its own stylesheet and wants
both attributes, so it reserves the right box before the image loads.
`build.sh --check` enforces each rule against its own page.

Four things will each silently produce a wrong file:

- **Chrome clears emulation overrides when a CDP client disconnects.**
  Set the theme in the same script that takes the screenshot.
- **`localStorage["sim.theme"]` beats `prefers-color-scheme`.** With it
  set to `dark` or `light` the app stamps `data-theme` and ignores the
  media query, so both passes come out identical. Put it on `system`.
- **The VNC canvas draws the *remote* cursor.** Park the mouse outside
  the desktop before the shot or an I-beam is baked into it.
- **Theme emulation does not reach inside the VNC canvas.** The exam
  desktop carries its own palette, so the light exam shot is a light
  app frame around a dark desktop. That is what the product looks like.

The score and progress screens need a graded attempt behind them, and
Training does not record one — sit Mastery or Exam. Progress needs at
least two attempts before it has a trend to draw.

## Rules that are not negotiable

**No third-party exam dump may ever be committed**, not even
temporarily. The banks are CC BY-SA 4.0, which requires them to be ours
to license. `.gitignore` bans every `.txt` under `banks/` — a bank is
YAML, Markdown and shell, so a `.txt` there is foreign by definition.

**Two image tags must stay absent from `images/k8s-env/preload.txt`:**

- `nginx:1.99` — question 02's broken image.
- `nginx:0.0.0-corvus-nonexistent` — question 17's unpullable image, the
  one the candidate has to read off the Deployment and correct.

Both questions are built on those tags *not* resolving. Preloading them
breaks two questions silently, and only a smoke run on a cold cache
would notice.

The two bullets above are machine-read. `tests/check-preload.sh` takes
its tag list from them rather than keeping a second copy, and checks
each tag against the question cited beside it. Reword them freely;
unbullet them, drop a tag's backticks, or remove a question number and
the gate goes red, which is what keeps the rule and the check from
drifting apart.

**All user-facing copy belongs in `ui/src/strings.ts`.**

**Every surface that names a certification carries the non-affiliation
notice.** See [SECURITY.md](SECURITY.md#brand-and-affiliation).

**A bank that cannot produce a meaningful score is not offered at all.**
Too few questions belongs in the catalog as coming soon, not in the exam
list looking like a full attempt.

## Writing questions

[docs/bank-spec.md](docs/bank-spec.md) is the reference: the `exam.yaml`
schema, the validator contract, the point and domain-weight rules, and
the lint that fails the build on checks grading spelling instead of
behaviour.

## Commits and pull requests

Subject line: `type: what changed` or `type(scope): what changed`. Lower
case, no trailing period.

| Type | For |
|---|---|
| `feat` | New behaviour |
| `fix` | A defect |
| `docs` | Documentation |
| `copy` | User-facing wording that changes no behaviour |
| `test` | Tests only |
| `chore` | Tooling, config, housekeeping |
| `bank` | Question bank content |

Scopes in use: `ui`, `api`, `site`, `exam`, `smoke`, `bank-spec`.

Write the subject as a phrase a reader understands without the diff:

```
fix: behavioural checks that cost 5 points to a stopwatch
bank: derive point budgets from the curriculum instead of assigning them
```

Open a pull request against `main`. Say whether you ran
`tests/smoke.sh`, since CI cannot.
