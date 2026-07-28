## Hint 1

Four separate operations, and one of them is a search rather than a
command. `helm list` has a flag for showing releases that are not in a
good state.

Task 3's "set through Helm values at install time" rules out
`kubectl scale` afterwards — the grader can tell.

## Hint 2

`helm -n carina list --all` shows the failed release that plain
`helm list` hides.

`helm -n carina uninstall <name>` for tasks 1 and 4.

For the upgrade, `helm search repo sim/sim-web --versions` lists what is
available; pass `--version` to `helm upgrade`.

For the install, `--set replicaCount=2` (check the chart's values with
`helm show values sim/sim-cache` if the key differs).
