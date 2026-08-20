# Solution 10

Read the base first, so you know what you are transforming:

```bash
cd /opt/course/10
cat base/kustomization.yaml base/deployment.yaml base/service.yaml
kubectl kustomize base        # renders the base untouched
```

The whole answer is three transformers in the overlay:

```yaml
# /opt/course/10/overlays/prod/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: scutum
resources:
  - ../../base

images:
  - name: nginx
    newTag: 1.29-alpine

replicas:
  - name: helios-web
    count: 3

labels:
  - pairs:
      env: prod
    includeSelectors: false
    includeTemplates: true
```

Render it, read what came out, and only then apply:

```bash
kubectl kustomize overlays/prod
kubectl apply -k overlays/prod
kubectl -n scutum rollout status deploy/helios-web
kubectl -n scutum get deploy,svc,pod --show-labels
```

`apply -k` takes a kustomization directory the way `apply -f` takes a
file. No `-n` is needed here because the overlay carries `namespace:
scutum`, which stamps the Namespace onto every resource it renders; the
Namespace object itself is not created by that field, and it is already
there.

## The three transformers

- **`images`** matches on the image *name* as the base writes it — the
  bare `nginx`, not the full `nginx:1.27-alpine` — and replaces the tag
  through `newTag`. Matching on the tagged string finds nothing and the
  transformer silently does no work. `newName` is the separate field for
  changing the repository, and the two can be used together.
- **`replicas`** matches the resource's own name, `helios-web`. It sees
  resources *before* a `namePrefix` would have been applied, so in an
  overlay that renames things it is the base's name that goes here.
- **`labels`** adds each pair under `pairs` to the metadata of every
  resource in the build. Where else it reaches is controlled by two
  switches, and the difference is the whole trap in this task.

## Why the label needs `includeTemplates`

`labels` on its own labels *objects*: the Deployment and the Service get
`env: prod` in their `metadata.labels` and nothing else changes. The Pods
are not objects in the build — they are created later by the Deployment
from its Pod template — so the label reaches them only when the
transformer is told to descend into that template:

- `includeTemplates: true` writes the pair into
  `spec.template.metadata.labels`, which is what puts it on the Pods.
- `includeSelectors: true` writes it into `spec.selector.matchLabels`
  *and* the template. That also satisfies this question, and it carries a
  cost worth knowing: a Deployment's selector is immutable after
  creation, so turning this on for a workload that already exists makes
  every later `apply` fail with a field-is-immutable error, and the fix
  is to delete and recreate the Deployment.

The older spelling does exist and still builds:

```yaml
commonLabels:
  env: prod
```

It behaves exactly like `labels` with `includeSelectors: true` — metadata,
selectors and templates — and the kustomize built into `kubectl` prints a
deprecation warning to stderr telling you to move to `labels`. All three
routes put the label where this question asks for it, which is why the
grading looks at the live objects rather than at your file.

## What is graded

Every check here reads the API: the image and replica count on the live
Deployment, its ready Pods, and the `env: prod` label on the Deployment,
on the Service and on the running Pods. Building the overlay proves
nothing on its own — rendering and applying are two separate acts, and
until the second one runs the Namespace holds nothing at all.
