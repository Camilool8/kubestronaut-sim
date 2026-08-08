# Solution 35

Read the base first, and confirm it renders on its own:

```bash
cd /opt/course/35
cat base/kustomization.yaml base/deployment.yaml
kubectl kustomize base
```

Neither requirement has a `kustomization.yaml` field behind it. There is
no `env:` transformer and no probe transformer — `images`, `replicas`,
`namePrefix`, `namespace` and `labels` are the whole vocabulary, and it
is deliberately small. Anything outside it is a patch.

```yaml
# /opt/course/35/overlays/prod/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../base

patches:
  - patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: ledger-api
      spec:
        template:
          spec:
            containers:
              - name: api
                env:
                  - name: LEDGER_MODE
                    value: prod
                readinessProbe:
                  initialDelaySeconds: 5
```

Render it, read what came out, and only then apply:

```bash
kubectl kustomize overlays/prod
kubectl -n norma apply -k overlays/prod
kubectl -n norma rollout status deploy/ledger-api
kubectl -n norma get deploy ledger-api \
  -o jsonpath='{.spec.template.spec.containers[0].env}{"\n"}'
```

## Why this merges rather than replaces

That fragment is a **strategic merge patch**, and strategic merge knows
the Kubernetes types:

- `spec.template.spec.containers` is a list whose merge key is `name`, so
  the entry named `api` is merged into the base's `api` container rather
  than replacing the list. Omit the name and kustomize has nothing to
  match on.
- `readinessProbe` is a struct, so it merges field by field. Supplying
  `initialDelaySeconds` alone leaves `httpGet`, `path`, `port` and
  `periodSeconds` exactly as the base has them. This is the part worth
  internalising — the same patch written against a plain list would have
  wiped the probe.
- `env` is a list with merge key `name` too, so `LEDGER_MODE` is added
  beside anything already there rather than replacing it.

Everything you do not mention is left alone. A patch is a description of
the difference, not a replacement document.

## The JSON 6902 alternative

The same two changes, addressed by path instead:

```yaml
patches:
  - target:
      kind: Deployment
      name: ledger-api
    patch: |-
      - op: add
        path: /spec/template/spec/containers/0/env
        value:
          - name: LEDGER_MODE
            value: prod
      - op: replace
        path: /spec/template/spec/containers/0/readinessProbe/initialDelaySeconds
        value: 5
```

It is exact and it is brittle: `/containers/0` is a position, so
inserting a sidecar ahead of `api` silently retargets the patch at the
wrong container. `op: replace` also fails outright if the path does not
exist, where `add` on a list index inserts. Reach for 6902 when strategic
merge cannot express the change — deleting a list element, or patching a
custom resource whose schema kustomize does not know — and prefer
strategic merge otherwise.

## Why the base is off limits

Editing `base/deployment.yaml` reaches the same rendered output and
destroys the reason the directory is laid out this way. The base is what
every environment shares; the overlay is what one environment differs by.
Put `LEDGER_MODE=prod` in the base and staging gets it too, silently, the
next time anyone builds it — and the overlay that is supposed to document
production's differences documents nothing.

The check builds the overlay *and* reads what the base still says, so the
shortcut scores zero for the same reason.

## `patches` versus the older keys

`patchesStrategicMerge` and `patchesJson6902` are the deprecated
predecessors of the single `patches` field, which infers which of the two
a document is by looking at it. They still build; `patches` is what to
write in anything new.

A patch entry can also point at a file instead of inlining the document:

```yaml
patches:
  - path: probe-and-env.yaml
```

which is the better shape once a patch outgrows a few lines, because the
file is a real manifest that an editor will validate and highlight.
