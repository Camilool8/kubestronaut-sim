# Local Helm charts

Charts here are packaged into `/shared/helm-repo` and served over plain
HTTP on `k8s-env:8879`, both by `images/k8s-env/start.sh` and
before `bootstrap.sh` runs. Every instance pre-adds the repository as
`sim`, so a
candidate starts a Helm question the way the real exam starts one — with
a repo already configured — rather than spending exam time on
`helm repo add`.

They are kept as plain source directories, not committed tarballs, so a
change is reviewable as a diff. They are deliberately trivial: the skill
under test is Helm's release lifecycle (install with values, upgrade,
rollback, list, uninstall, and finding a release stuck mid-operation),
not the application inside the chart.

**One directory per chart version.** `helm package` names the tarball
from `Chart.yaml`, so the directory name is a convention, not a key.

| Directory | `name:` | `version:` |
|---|---|---|
| `sim-web-1.0.0/` | `sim-web` | 1.0.0 |
| `sim-web-1.1.0/` | `sim-web` | 1.1.0 |
| `sim-cache-1.0.0/` | `sim-cache` | 1.0.0 |

The two `sim-web` directories declare the same chart at different
versions, and both end up in the index — which is what makes "upgrade
this release to a newer version of the chart" a real question with a
real answer. `sim-cache` is a separate chart, not a third version.

`_charts` is not a bank: the conductor enumerates `banks/*/exam.yaml`,
and a directory without one is invisible to it (the bank id pattern
would reject a leading underscore in any case).

Images referenced by these charts should stay within the small set the
question banks already use, so the cluster's image cache is shared rather
than multiplied.
