## Hint 1

Read the failure before you fix it: `kubectl -n nova describe deploy
nova-api` and the Pod events tell you what the image actually is. Record
it before you touch anything — once you fix the image it is gone.

Tasks 4 and 5 are both edits to the same Deployment.

## Hint 2

The image lives at `.spec.template.spec.containers[0].image`.

`maxSurge` and `maxUnavailable` live under
`.spec.strategy.rollingUpdate`, and `maxUnavailable: 0` is the half that
makes "never reduce available replicas" true.

A readinessProbe with an `httpGet` needs `path` and `port` — the rest of
the fields the question names sit beside it, not inside it.
