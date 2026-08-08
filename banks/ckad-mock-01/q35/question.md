A Kustomize base lives at `/opt/course/35/base` on `instance-1`, holding
Deployment `ledger-api`. Its unfinished production overlay is at
`/opt/course/35/overlays/prod`.

Complete **only** `/opt/course/35/overlays/prod/kustomization.yaml` — do
not edit anything under `base/` — so that building the overlay renders a
Deployment whose container `api`:

1. has the environment variable `LEDGER_MODE` set to `prod`
2. becomes ready sooner: `readinessProbe.initialDelaySeconds` is `5`
   instead of the base's `30`, with the rest of the probe unchanged

Neither of those is something a `kustomization.yaml` field such as
`images`, `replicas` or `namePrefix` can express, so the overlay must
carry a **patch**.

Then apply the overlay to Namespace `norma`, so that Deployment
`ledger-api` exists there with 2 ready replicas.

Preview your work before applying it:

```bash
kubectl kustomize /opt/course/35/overlays/prod
```
