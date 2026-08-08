## Hint 1

Read the Service's selector before you write anything, and ask which of
the stable Pods' labels it actually names:

```bash
k -n lupus get svc search -o jsonpath='{.spec.selector}'
k -n lupus get pods --show-labels
```

Nothing routes here in proportions. There is only one endpoint list and
kube-proxy picks from it evenly, so the fraction is decided entirely by
how many Pods of each kind are in it.

## Hint 2

The canary's Pod template needs both labels: the one the Service selects
on, so it joins the endpoint list, and `track: canary`, so you can still
tell the two apart with `-l` and so its own `spec.selector.matchLabels`
does not overlap the stable Deployment's.

One fifth of five Pods is one Pod, and the total has to stay 5 — so the
stable Deployment does not stay where it is.

`kubectl create deployment --image=... --dry-run=client -o yaml` writes
the skeleton; the labels are the part you add by hand.
