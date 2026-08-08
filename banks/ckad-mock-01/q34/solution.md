# Solution 34

Ask the chart what it accepts before writing anything. Guessing key names
is the slow way to do this, and a key the chart does not have is accepted
silently and then ignored:

```bash
helm show values sim/sim-cache
# replicaCount: 1
# image:
#   repository: nginx
#   tag: 1.29-alpine
#   pullPolicy: IfNotPresent
```

Two of those need overriding, and the second one is nested. The file
mirrors that structure exactly:

```yaml
# /opt/course/34/cache-values.yaml
replicaCount: 3
image:
  tag: 1.27-alpine
```

Note what is *not* in it. `repository` and `pullPolicy` are left out, so
they keep coming from the chart — Helm merges maps key by key rather than
replacing them wholesale.

Install with it:

```bash
helm -n caelum install object-cache sim/sim-cache -f /opt/course/34/cache-values.yaml
helm -n caelum list
# NAME          REVISION  STATUS    CHART            APP VERSION
# object-cache  1         deployed  sim-cache-1.0.0  1.29-alpine
```

Then check what the release actually believes it was given, which is a
different question from what you meant to give it:

```bash
helm -n caelum get values object-cache
# replicaCount: 3
# image:
#   tag: 1.27-alpine

k -n caelum get deploy object-cache
# object-cache   3/3   3   3
```

`APP VERSION` still reads `1.29-alpine` because that comes from
`Chart.yaml` and is metadata about the chart, not about what you asked it
to run. The Pods are on 1.27:

```bash
k -n caelum get deploy object-cache \
  -o jsonpath='{.spec.template.spec.containers[*].image}'
# nginx:1.27-alpine
```

## Why a file rather than --set

`--set replicaCount=3 --set image.tag=1.27-alpine` produces an identical
release. Everything that differs is outside Helm:

- **It is reviewable.** A values file goes through the same review as
  code. A flag lives in one person's shell history.
- **It is the input to the next upgrade.** `helm upgrade` does not
  inherit the previous revision's values unless you say so, so an
  upgrade without the file or without `--reuse-values` silently reverts
  every override to the chart's defaults. With a file, the upgrade is
  the install command with one word changed.
- **It types things properly.** `--set` parses its own miniature syntax:
  commas separate values, dots descend into maps, and both have to be
  escaped when they are part of the data. `--set` also coerces what looks
  numeric, which is why `--set version=1.10` becomes `1.1`. YAML has none
  of these problems.
- **It nests without ceremony.** `image.tag` is a two-line block in a
  file and a dotted path in a flag, and the dots get worse with depth.

`--set` earns its place for the one value that must not be written down
— a password, a token — and for scripted one-offs.

## How the values are merged

Helm layers values in this order, each overriding the one before:

1. the chart's own `values.yaml`
2. each `-f` file, in the order given on the command line
3. `--set` and `--set-string`, applied last

So `-f base.yaml -f prod.yaml` is a legitimate way to keep a common file
and a per-environment one, and a stray `--set` always wins over both.

`helm get values <release>` shows only what *you* supplied. To see the
whole merged set the templates actually rendered against, ask for all of
it:

```bash
helm -n caelum get values object-cache --all
```

And to see the manifests a values file would produce without installing
anything:

```bash
helm template object-cache sim/sim-cache -f /opt/course/34/cache-values.yaml
```
