## Hint 1

All three probes are the same `httpGet` block with different timing
fields, added to the same container.

The endpoint count at the end is the real test: a readinessProbe that
never passes leaves the Pod out of the Service, so if endpoints stays at
0 your probe is wrong rather than missing.

## Hint 2

All three go under
`.spec.template.spec.containers[0]` as siblings: `startupProbe`,
`readinessProbe`, `livenessProbe`.

`kubectl -n hydra edit deploy orders-api` is the quickest route; the
rollout restarts the Pods for you.

Confirm with `kubectl -n hydra get endpointslice -l
kubernetes.io/service-name=orders-api` — you want two ready addresses.
