## What this changes

<!-- One or two sentences. The diff shows how; say why. -->

## Verification

CI runs the five bank gates, the Go tests, the UI suite, the image
builds and a shell syntax pass. It cannot run `tests/smoke.sh`, which is
the only thing that checks a fresh environment scores 0 and the
reference solutions score 100%.

- [ ] I ran `tests/smoke.sh` locally
- [ ] Not needed — this change cannot affect grading or the environment

See [docs/testing.md](https://github.com/Camilool8/kubestronaut-sim/blob/main/docs/testing.md).
