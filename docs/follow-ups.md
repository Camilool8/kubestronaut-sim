# Follow-ups (from Milestone A reviews — none blocking)

Convert to GitHub issues once the repo has a remote.

## Grading strictness / bank content
- q01 `10_list-file.sh`: strip trailing whitespace on populated lines before diffing.
- q01 `30_quota.sh`: accept equivalent resource quantities (e.g. `1000m` == `1`) instead of canonical-string match. Highest-value fix in this list.
- grader: tighten points guard to `(0|[1-9][0-9]*)` (leading-zero `08` currently hits bash octal parse).
- grader: wrap remote validate execution in `timeout` (connect-phase timeout exists; hung script still hangs grade). Add "checks must finish within N seconds" to bank-spec.

## Images
- instance: regenerate ssh host keys in entrypoint (currently baked into the image layer, shared across deployments).
- instance: explicit `chmod 700` on `~/.ssh` dirs (currently relies on build umask).
- k8s-env: pin `yq-go` apk package explicitly (alpine `yq` alias ambiguity).
- k8s-env: trap bootstrap failure to log a clear error before container exit (downstream currently sees only healthcheck timeout).

## UX / docs
- `./sim grade` on a downed stack: friendly "run ./sim up first" message instead of raw compose error.
- smoke: add a `./sim ssh`-based assertion so the wrapper's ssh path is exercised.
- bank-spec: note that `duration`, `passingScore`, `kubernetesVersion`, `environment.nodes` are informational in Milestone A (enforced by facilitator/evaluator in Milestone C).
- README: mention `k8s-env` runs privileged (DinD requirement).
- Cross-arch: amd64 build/run path never physically exercised (all local runs arm64) — cover in Milestone D CI.
