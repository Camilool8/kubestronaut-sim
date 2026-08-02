A Kustomize base lives at `/opt/course/13/base` on `instance-1`, with an
unfinished overlay at `/opt/course/13/overlays/staging`.

Complete **only** `/opt/course/13/overlays/staging/kustomization.yaml` —
do not edit anything under `base/` — so that building the overlay
produces:

1. every resource name prefixed with `staging-`
2. the label `tier: staging` on every resource
3. the Deployment's image changed to `nginx:1.29-alpine`
4. the Deployment scaled to `3` replicas

Then apply the overlay to Namespace `pavo`, so that Deployment
`staging-cargo-api` and Service `staging-cargo-api` exist there with 3
ready replicas.

Preview your work before applying it:

```bash
kubectl kustomize /opt/course/13/overlays/staging
```
