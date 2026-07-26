# Solution 13

Read the base first so you know what you are transforming:

```bash
cd /opt/course/13
cat base/kustomization.yaml base/deployment.yaml
kubectl kustomize base        # renders the base as-is
```

The whole answer is four fields in the overlay:

```yaml
# /opt/course/13/overlays/staging/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../base

namePrefix: staging-

labels:
  - pairs:
      tier: staging
    includeSelectors: false

images:
  - name: nginx
    newTag: 1.29-alpine

replicas:
  - name: cargo-api
    count: 3
```

Then render it, read what came out, and only apply once it is right:

```bash
kubectl kustomize overlays/staging
kubectl -n pavo apply -k overlays/staging
kubectl -n pavo rollout status deploy/staging-cargo-api
```

`apply -k` takes a kustomization directory the way `apply -f` takes a
file. The namespace comes from `-n` here; a `namespace:` field in the
kustomization would be the more usual way to pin it.

## The four transformers

- **`namePrefix`** renames every resource and fixes up references between
  them, which is why the Service still finds the Deployment's Pods.
- **`labels`** adds labels to everything. `includeSelectors: false`
  matters: with `true` (and with the older `commonLabels`, which always
  behaved that way) the label is also injected into the Deployment's
  `selector.matchLabels`. Selectors are immutable after creation, so
  doing that to a Deployment that already exists makes every later apply
  fail.
- **`images`** matches on the image *name* as written in the base
  (`nginx`), not the full reference, and replaces the tag. `newName`
  changes the repository instead, and both can be used together.
- **`replicas`** matches on the resource's **original** name —
  `cargo-api`, not `staging-cargo-api`. Transformers see the resource
  before the prefix is applied, and using the prefixed name is the usual
  reason a replica override silently does nothing.

## Why the check renders the overlay

Applying hand-written manifests that happen to match would satisfy any
check that only looked at the cluster. The question is about Kustomize,
so the grader builds the overlay and inspects what it produces — do the
work in the overlay and both checks pass together.
