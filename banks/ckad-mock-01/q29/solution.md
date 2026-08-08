# Solution 29

**1. Find the definition.** CustomResourceDefinitions are ordinary
cluster-scoped objects, so the ordinary verb works:

```bash
k get crd
```

```
NAME                                    CREATED AT
featuretoggles.flags.kubestronaut.dev   2026-01-01T00:00:00Z
```

That printed name is the fully-qualified one, and it is built as
`<plural>.<group>`:

```bash
k get crd featuretoggles.flags.kubestronaut.dev \
  -o jsonpath='{.spec.names.plural}.{.spec.group} {.spec.versions[*].name}{"\n"}'
# featuretoggles.flags.kubestronaut.dev v1alpha1

echo featuretoggles.flags.kubestronaut.dev > /opt/course/29/crd-name
```

**2. List what is already there.** The new type behaves like any other,
and the definition's printer columns decide the extra columns:

```bash
k -n sextans get featuretoggles
```

```
NAME              ENABLED   ROLLOUT   OWNER
legacy-checkout   false     0         payments-team
```

```bash
echo legacy-checkout > /opt/course/29/existing-toggle
```

`ft` works too — the definition declares it as a short name.

**3. Read the schema before writing the manifest.** `explain` is served
from the same OpenAPI document the API server validates against, so it
is authoritative for a custom type as much as for a built-in one:

```bash
k explain featuretoggle.spec --recursive
```

```
KIND:       FeatureToggle
VERSION:    flags.kubestronaut.dev/v1alpha1

FIELDS:
  enabled       <boolean> -required-
  owner         <string> -required-
  rollout       <integer>
```

```bash
k apply -f - <<'EOF'
apiVersion: flags.kubestronaut.dev/v1alpha1
kind: FeatureToggle
metadata:
  name: dark-mode
  namespace: sextans
spec:
  enabled: true
  rollout: 25
  owner: platform-team
EOF
k -n sextans get ft
```

## What a CRD actually buys you

Applying a CustomResourceDefinition adds a REST path to the API server
and nothing else:

```bash
k get --raw /apis/flags.kubestronaut.dev/v1alpha1 | jq .
```

From that moment the new kind gets everything the built-in kinds get —
validation against its schema, RBAC by resource name, labels and
selectors, `-o jsonpath`, watch, and storage in etcd. What it does **not**
get is behaviour. Nothing reconciles a `FeatureToggle`; it is a record
until somebody writes a controller that watches the path and acts on
what it finds. A CRD with a controller beside it is an operator; a CRD
on its own, like this one, is a typed configuration store.

Two fields on the definition are worth knowing because they are the ones
that bite:

- **`scope`** is `Namespaced` or `Cluster`, and it is fixed at
  definition time. This one is namespaced, which is why `-n sextans` is
  required and why a resource created without it lands in `default` and
  seems to vanish.
- **`versions[].served` and `.storage`** are separate switches. Several
  versions may be served at once; exactly one is the version actually
  written to etcd.

## When kubectl says the kind does not exist

`error: unable to recognize "STDIN": no matches for kind "FeatureToggle"`
means the client could not map the kind to a path — almost always a
discovery cache written before the definition existed. It is kept under
`~/.kube/cache` and expires on its own within minutes; deleting that
directory fixes it immediately.

The same message with a *correct* cache means something simpler: a typo
in `apiVersion`, or the group left off it entirely.
