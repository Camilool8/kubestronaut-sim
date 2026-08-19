# Solution 9

Three operations on one release: an install pinned to an old chart version, an
upgrade to a newer one that must not lose the overrides, and a local render of
the result to a file.

Start by asking the repo what it holds. Guessing a version number that is not
published just fails:

```bash
helm search repo sim/sim-web --versions
# NAME          CHART VERSION  APP VERSION
# sim/sim-web   1.1.0          1.29-alpine
# sim/sim-web   1.0.0          1.27-alpine
```

Then ask the chart which keys it accepts, because a key it does not use is
accepted silently and then ignored:

```bash
helm show values sim/sim-web --version 1.0.0
# # Overridable at install/upgrade time with --set or -f.
# replicaCount: 1
# image:
#   repository: nginx
#   tag: 1.27-alpine
#   pullPolicy: IfNotPresent
# service:
#   port: 80
```

`replicaCount` is top level and `port` is nested under `service`, so on the
command line the second one is a dotted path.

**1. Install 1.0.0 with both overrides:**

```bash
helm -n tucana install storefront sim/sim-web --version 1.0.0 \
  --set replicaCount=3 --set service.port=8080 --wait
```

**2. Upgrade to 1.1.0 — and repeat the overrides:**

```bash
helm -n tucana upgrade storefront sim/sim-web --version 1.1.0 \
  --set replicaCount=3 --set service.port=8080 --wait
```

This is the part of the task that catches people. `helm upgrade` does **not**
inherit the previous revision's values: it renders the new chart against the
chart's own defaults plus whatever you pass on this command line. Upgrade
without the two `--set` flags and the release comes back with one replica on
port 80 — a successful upgrade that quietly undid the configuration. The other
way to keep them is to ask for it explicitly:

```bash
helm -n tucana upgrade storefront sim/sim-web --version 1.1.0 --reuse-values
```

`--reuse-values` merges the previous revision's values over the new chart's
defaults. It is the shorter command and the more surprising one when a chart
version adds a value, because a key introduced in 1.1.0 that the old release
never set still comes from the new chart's defaults, while anything you did
set is frozen at what you set it to. Passing the values again is the habit
that survives review; `--reuse-values` is for the release whose values you no
longer have.

Check what the release believes it was given, which is a different question
from what you meant to give it:

```bash
helm -n tucana ls
# NAME        REVISION  STATUS    CHART          APP VERSION
# storefront  2         deployed  sim-web-1.1.0  1.29-alpine

helm -n tucana get values storefront
# replicaCount: 3
# service:
#   port: 8080

helm -n tucana history storefront
# REVISION  STATUS      CHART          DESCRIPTION
# 1         superseded  sim-web-1.0.0  Install complete
# 2         deployed    sim-web-1.1.0  Upgrade complete
```

Two revisions are the evidence that this went through an install and then an
upgrade. Installing 1.1.0 directly reaches the same objects and leaves a
one-revision history, which is not what was asked for — and `helm rollback`
would then have nowhere to go.

The chart version is also visible in the cluster, because 1.0.0 and 1.1.0
default to different image tags:

```bash
k -n tucana get deploy storefront \
  -o jsonpath='{.spec.template.spec.containers[*].image}'
# nginx:1.29-alpine

k -n tucana get svc storefront
# NAME        TYPE       PORT(S)
# storefront  ClusterIP  8080/TCP
```

The tag was never overridden, so it comes from the chart and moving from
1.0.0 to 1.1.0 is what changed it from `1.27-alpine` to `1.29-alpine`.

The instance is not a cluster node, so a ClusterIP is not reachable from your
shell. Test the Service from inside:

```bash
k -n tucana exec deploy/storefront -- wget -qO- -T 4 http://storefront:8080 | head -3
```

**3. Render the manifests to a file:**

```bash
helm template storefront sim/sim-web --version 1.1.0 \
  --set replicaCount=3 --set service.port=8080 > /opt/course/9/manifest.yaml
```

`helm template` renders the chart locally and prints the result. It talks to
no cluster, creates no release and records nothing, which is exactly why it is
the command for "show me what this would produce". The release name is an
argument rather than a flag, and it matters: the chart builds every object's
name from `.Release.Name`, so rendering under a different name produces a
document about a release that does not exist.

```bash
head -20 /opt/course/9/manifest.yaml
grep -c '^kind:' /opt/course/9/manifest.yaml   # 2 — a Deployment and a Service
```

## helm template, helm get manifest, helm install --dry-run

Three ways to look at rendered YAML, and they answer different questions:

- **`helm template`** renders from a chart on disk or in a repo. No cluster is
  contacted at all, so it works with no kubeconfig and cannot tell you
  anything about what is installed.
- **`helm get manifest <release>`** prints what a release actually holds —
  the YAML of the revision Helm has recorded. Use it to see what is deployed;
  it is the second half of "what would change".
- **`helm install --dry-run --debug`** renders the same way `template` does,
  but goes to the API server for validation, so it catches a manifest the
  cluster would reject.

For this question either of the first two is defensible, but they are not
interchangeable: `get manifest` reflects the release as installed, so an
override the upgrade dropped would be missing from the file too — and it
would look like the render was wrong when the mistake was in step 2.
