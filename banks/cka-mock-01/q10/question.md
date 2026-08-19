A Kustomize base for the `helios-web` app lives at `/opt/course/10/base`,
with a production overlay at `/opt/course/10/overlays/prod` that so far
does nothing but point at the base and pin the Namespace `scutum`.

Complete **only** `/opt/course/10/overlays/prod/kustomization.yaml` — do
not edit anything under `base/` — so that building the overlay renders:

1. the Deployment's container image on tag `nginx:1.29-alpine`
2. the Deployment scaled to `3` replicas
3. the label `env: prod` on the Deployment, on the Service, **and** on
   the Pods the Deployment creates

Then apply the overlay, so that Deployment `helios-web` and Service
`helios-web` exist in Namespace `scutum` with 3 ready replicas.

Render the overlay and read it before you apply anything:

```bash
kubectl kustomize /opt/course/10/overlays/prod
```
