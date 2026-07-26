# Solution 11

Start by seeing what is there. `-a` matters: without it, `helm ls` shows
only `deployed` releases, and the broken one you are asked to find is
exactly the one it hides.

```bash
helm -n carina ls -a
# NAME             REVISION  STATUS    CHART
# report-api-v1    1         deployed  sim-web-1.0.0
# report-api-v2    1         deployed  sim-web-1.0.0
# report-legacy    1         failed    sim-web-1.0.0
# report-web       1         deployed  sim-web-1.1.0
```

That answers task 4 before you start looking for it — `report-legacy` is
the failed one.

**1. Uninstall `report-api-v1`:**

```bash
helm -n carina uninstall report-api-v1
```

**2. Upgrade `report-api-v2`.** First find out what versions exist —
guessing a version number that is not in the repo just fails:

```bash
helm search repo sim/sim-web --versions
# CHART VERSION  APP VERSION
# 1.1.0          1.29-alpine
# 1.0.0          1.27-alpine

helm -n carina upgrade report-api-v2 sim/sim-web --version 1.1.0
```

Without `--version`, Helm takes the newest in the repo, which also works
here. Being explicit is the better habit: it makes the upgrade
reproducible rather than dependent on what the repo happens to hold.

**3. Install `report-cache` with 2 replicas:**

```bash
helm -n carina install report-cache sim/sim-cache --set replicaCount=2
```

`--set` is what "through Helm values" means. Installing with the default
and then running `kubectl scale` reaches the same replica count today and
loses it at the next `helm upgrade`, because the chart's values still say
1 — which is why the check looks at the release's values and not just the
Deployment.

Not sure what a chart accepts? Read its defaults:

```bash
helm show values sim/sim-cache
```

**4. Remove the failed release:**

```bash
helm -n carina uninstall report-legacy
```

Confirm the end state:

```bash
helm -n carina ls -a
k -n carina get deploy
```

## Why a release fails

`report-legacy` was installed with an image tag that does not exist, so
its Pods never became ready, `--wait` timed out, and Helm recorded the
release as `failed`. The objects it created are still in the cluster —
that is the point of a failed release, and why `uninstall` rather than
`kubectl delete` is the right cleanup: it removes the release record too.

A release stuck in `pending-install` or `pending-upgrade` is the nastier
cousin, usually caused by Helm being killed mid-operation. It blocks
every subsequent operation on that release with "another operation is in
progress"; `helm rollback` or, failing that, deleting the release's
`sh.helm.release.*` Secret is the way out.
