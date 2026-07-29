# Frozen milestone artifacts

These are the plans and specs the project was built from, kept because
they record why several non-obvious decisions were made. They are not
maintained.

**Where they disagree with the code, the code is right.** They are
written in the imperative ("Run this", "Add that"), which makes them
read like current instructions. They are not. Some contain absolute
paths from the machine they were written on, and some reference files
that no longer exist — `images/k8s-env/grade.sh` moved into the
facilitator, and `tests/solutions/qNN.sh` became
`tests/solutions/<bank>/qNN.sh`.

The series is incomplete: plans exist for milestones A, B, C and F, and
specs for A, B, C, D, F and G. The rest were never written down in this
form.

Not everything here is a milestone. `specs/2026-07-28-clipboard-sync-design.md`
records a single piece of work — host↔desktop clipboard sync — and is
kept here because it is the same kind of artifact, frozen the moment it
shipped.

For anything current, use:

| You want | Read |
|---|---|
| The bank format | [../bank-spec.md](../bank-spec.md) |
| The HTTP API | [../api.md](../api.md) |
| How the pieces fit | [../architecture.md](../architecture.md) |
| How to build and test | [../../CONTRIBUTING.md](../../CONTRIBUTING.md) |
| What is still open | [../follow-ups.md](../follow-ups.md) |

The rules from these documents that still bind are in
[CONTRIBUTING.md](../../CONTRIBUTING.md) under "Things that will bite
you".
