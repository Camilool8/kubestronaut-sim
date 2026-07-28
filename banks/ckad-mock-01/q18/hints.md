## Hint 1

Do not edit `legacy.yaml` — copy it first. The grader checks that the
original is untouched, byte for byte.

Task 3 is answerable from the cluster itself; you do not need to know the
version from memory.

## Hint 2

`kubectl explain cronjob` prints the served version at the top, and
`kubectl api-resources | grep -i cronjob` shows it too.

CronJob moved from `batch/v1beta1` to `batch/v1`; Ingress moved to
`networking.k8s.io/v1`, which also restructured `backend` into
`backend.service.name` / `backend.service.port.number` and made
`pathType` required.

`kubectl apply --dry-run=server -f fixed.yaml` validates without
creating anything.
