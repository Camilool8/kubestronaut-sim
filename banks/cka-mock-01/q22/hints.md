## Hint 1

Three changes, and only one of them creates an object. Do that one first:
everything else refers to it by name, and a Pod that names a class which
does not exist yet is the one thing here the API refuses outright.

The value is not a number to invent. It is a number to beat, and the two
classes it has to beat are already in the cluster —
`kubectl get priorityclass` prints them, and PriorityClasses are
cluster-scoped, so no `-n` will help or hurt.

The other two changes are both on the Deployment, in two different places:
one lives inside the Pod template, the other beside it on the Deployment's
own spec. `kubectl explain deploy.spec.strategy` and
`kubectl explain deploy.spec.template.spec` will tell you which is which.

## Hint 2

There is a generator, and it covers the whole class in one line — including
the field you might expect to have to add by hand:

```bash
k create priorityclass q22-critical --value=<n> --preemption-policy=Never \
  --description="checkout tier" $do
```

`--global-default` defaults to `false`, so the safest thing to do about it is
nothing at all.

The Deployment side is two fields at two paths, and one
`kubectl patch --type=merge` (or one `kubectl edit`) can carry both:

- `spec.template.spec.priorityClassName`
- `spec.strategy.rollingUpdate`, which holds `maxSurge` and `maxUnavailable`

Only the first of those is inside the template, so only the first rolls new
Pods — which is a reason to set the other one first.

Order matters in one direction only. Change the template before the class
exists and the ReplicaSet is refused every Pod it tries to create — and with
`maxUnavailable: 0` the old Pods stay up and serving, so nothing looks
broken. `k -n reticulum describe rs` is where that shows up.

Finish by reading what the Pods actually got, not what the template asks
for:

```bash
k -n reticulum get pod -o custom-columns=CLASS:.spec.priorityClassName,PRIORITY:.spec.priority
```
