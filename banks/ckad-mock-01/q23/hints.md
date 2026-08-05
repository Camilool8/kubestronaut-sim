## Hint 1

Nothing about the two Deployments changes. Ask what a Service actually
uses to decide where a request goes — it is not the Deployment's name,
and it is not the Pod's name either.

Compare the labels on the two sets of Pods:

```bash
k -n lacerta get pods --show-labels
```

## Hint 2

`spec.selector` on the Service is the whole switch. `kubectl edit`,
`kubectl patch --type=merge` or a re-`apply` all move it.

One trap: a merge patch adds keys to a map rather than replacing it, so
patching in `release: green` on its own leaves `release: blue` behind
only if you spell it as a different key — check what you ended up with
before you trust it:

```bash
k -n lacerta get svc checkout -o jsonpath='{.spec.selector}'
```
