# Documentation

Start with [README.md](../README.md) if you want to run an exam. These
pages are for changing the thing.

## Understanding it

- [architecture.md](architecture.md) — the containers, the networks,
  the boot sequence, and what happens during one attempt.
- [../SECURITY.md](../SECURITY.md) — what is defended, what is not, and
  why the conductor is the only real boundary.

## Doing something specific

- [../CONTRIBUTING.md](../CONTRIBUTING.md) — set up, build, and the
  non-obvious rules that will otherwise cost you an afternoon.
- [testing.md](testing.md) — what to run before pushing, what CI
  enforces, and what CI structurally cannot.
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — symptoms and fixes, from
  the preflight through boot, an attempt, and grading.
- [hosting.md](hosting.md) — running it for other people: the Helm
  chart, every cap it takes as a value, and the handful of things a
  hosted session does differently from `./sim up`.
- [../site/README.md](../site/README.md) — the GitHub Pages landing
  page: which of its files are generated mirrors, and what
  `site/build.sh --check` does and does not catch.

## Looking something up

- [cli.md](cli.md) — every `./sim` subcommand, environment variable,
  and published port.
- [api.md](api.md) — the facilitator, conductor and hub HTTP APIs.
- [bank-spec.md](bank-spec.md) — the question bank format and the
  validator contract.

## Project state

- [follow-ups.md](follow-ups.md) — deliberate divergences from the real
  exam, accepted trade-offs, and constraints that read like gaps. The
  open backlog is in GitHub issues.
- [../PRODUCT.md](../PRODUCT.md) — scope, durable constraints, and what
  is deliberately not built.
- [../DESIGN.md](../DESIGN.md) — the UI design system.

## history/

Frozen milestone plans and specs from the tooling that built this
project. They record why several non-obvious constraints exist, and they
are not maintained. Where they disagree with the code, the code is
right. See [history/README.md](history/README.md).
