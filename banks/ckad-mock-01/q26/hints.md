## Hint 1

Two settings, and they do not live at the same level. One of them is a
property of each container; the other is a property of the Pod as a
whole. Getting that backwards is the mistake this question is built
around, and `kubectl explain` will tell you which is which before the API
server does.

Read what the Deployment says now before changing it — one of the two
fields already has a value you did not write.

## Hint 2

The pull-policy field takes one of three words, and the one you want is
the one that forbids a pull outright rather than the one that avoids an
unnecessary one. It has to be written twice, once per container.

The grace period is `terminationGracePeriodSeconds`, directly under
`spec.template.spec`, beside `containers` rather than inside it.

Editing the template starts a rollout. Wait for it before believing the
Pods have changed:

```bash
k -n volans rollout status deploy/edge-cache
```
