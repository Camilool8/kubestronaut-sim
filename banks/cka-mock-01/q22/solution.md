# Solution 22

**1. Read the ranking before adding to it.** The question deliberately
withholds the two values, because the first move on a task like this is
always to look:

```bash
k get priorityclass
```

That lists them by name, which is not the order that matters here.
`--sort-by=.value` reorders the same table; a projection shows the two
columns you actually care about and nothing else:

```bash
k get priorityclass -o json | jq -r '.items[] | "\(.value)\t\(.metadata.name)"' | sort -n
```

```
10000	q22-bulk
250000	q22-standard
2000000000	system-cluster-critical
2000001000	system-node-critical
```

That is the whole shape of the answer. The new class has to sit above
250000 and below the ceiling the question gave you, and the ceiling
exists because of the two rows at the bottom: those are the classes the
cluster's own components use, and a workload valued above them competes
with the control plane for room. Anything in the high hundreds of
thousands does the job. 500000 is used below.

The convention to copy is on the classes themselves:

```bash
k get priorityclass q22-standard -o jsonpath='{.preemptionPolicy}{"\n"}'
```

```
Never
```

Note there is no `-n` on any of those commands and no place to put one.
PriorityClasses are cluster-scoped: one list, shared by every Namespace.

**2. Create the class.** The generator covers all of it:

```bash
k create priorityclass q22-critical --value=500000 --preemption-policy=Never \
  --description="Checkout tier. Scheduled ahead of q22-standard, never preempts."
```

`--global-default` exists too and defaults to `false`. Leave it alone —
the section below on what it does is the reason the question rules it
out.

Written as a manifest it is flat, with no `spec:` at all, which is
unusual enough to be worth seeing once:

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: q22-critical
value: 500000
globalDefault: false
preemptionPolicy: Never
description: "Checkout tier. Scheduled ahead of q22-standard, never preempts."
```

**3. Both Deployment changes, in one patch.** The strategy first is not
superstition: `spec.strategy` is not part of the Pod template, so
changing it on its own rolls nothing, and it has to be in place before
the promotion rolls if the promotion is to be the rollout it governs.
One patch does both:

```bash
k -n reticulum patch deploy checkout-api --type=merge -p '{
  "spec": {
    "strategy": {"rollingUpdate": {"maxSurge": 2, "maxUnavailable": 0}},
    "template": {"spec": {"priorityClassName": "q22-critical"}}}}'
```

```bash
k -n reticulum rollout status deploy/checkout-api
```

`kubectl edit` does the same job. What does not work is any route through
a live Pod: `priorityClassName` is not among the few Pod fields an update
may change, so the API rejects the edit, and a Pod is owned by a
ReplicaSet that would rebuild it from the template regardless.

**4. Confirm the Pods, not the template.** The template is a request; the
Pods are the answer:

```bash
k -n reticulum get pod \
  -o custom-columns=NAME:.metadata.name,CLASS:.spec.priorityClassName,PRIORITY:.spec.priority
```

```
NAME                            CLASS          PRIORITY
checkout-api-6b4c9f7d8c-hs4qk   q22-critical   500000
checkout-api-6b4c9f7d8c-x2n6w   q22-critical   500000
```

`spec.priority` is the part worth looking at. You never wrote it — you
wrote a name, and the Priority admission plugin resolved that name to the
class's integer as each Pod was created. Two consequences follow from
"as each Pod was created", and both of them turn up in real clusters:

- A Pod keeps the number it resolved. Delete the class afterwards and the
  running Pods carry on at 500000; they simply cannot be replaced, because
  the next Pod that names a class that no longer exists is refused.
- A Pod created before the class existed resolved to something else, and
  no amount of creating the class later changes that Pod. Only a new Pod
  gets the new number.

## What `preemptionPolicy: Never` actually changes

Priority does two separate jobs, and this field switches the second one
off.

| Job | Applies when | Turned off by `Never`? |
|---|---|---|
| Ordering in the scheduling queue | always | no |
| Evicting lower-priority Pods to make room | only when the Pod cannot otherwise be scheduled | yes |

With the default, `PreemptLowerPriority`, a Pending high-priority Pod
that does not fit anywhere makes the scheduler look for a node where
evicting some lower-priority Pods would let it fit, and then delete them.
Nothing about that is confined to your Namespace: a PriorityClass is
cluster-scoped, the victims are chosen by priority and by fit, and the
Pods with no class at all sit at priority 0, which makes them the first
candidates everywhere in the cluster.

With `Never`, the Pod is still placed in the queue ahead of everything
below it — it gets the next free slot before they do — and if nothing
fits, it waits, exactly like an ordinary Pod. That is the setting for a
workload that should be served first without ever being allowed to
displace someone else's, which describes most "important" applications
far better than the default does.

## `globalDefault` is a cluster-wide switch

There is at most one global default in a cluster, and it is not a default
for your workload — it is the class the admission plugin applies to
**every Pod created anywhere** that names no `priorityClassName` at all.
Set it here and the batch jobs in another Namespace, the add-ons, and
anything a colleague creates tomorrow all become priority 500000, which
first makes the ranking meaningless and then, on a class that preempts,
makes it dangerous.

The way to put a workload on a class is the way this question does it:
name the class in that workload's Pod template.

## `value` cannot be changed afterwards

Try to raise a class instead of creating one and the API stops you:

```
The PriorityClass "q22-standard" is invalid: value: Forbidden: may not be changed in an update.
```

Everything else — `description`, `globalDefault` — is editable. The value
is not, and the reason is the one above: Pods resolve it at admission, so
a value that could change would leave a cluster full of Pods whose
priority no longer matched the class they name. To renumber a class you
delete it and create it again, and every Pod created in between is
refused.

## The two rollout knobs

`maxSurge` and `maxUnavailable` are the whole of a rolling update's
arithmetic, expressed against the replica count:

| Field | Means | Default |
|---|---|---|
| `maxSurge` | how many Pods may exist ABOVE `replicas` during the rollout | 25%, rounded **up** |
| `maxUnavailable` | how many of `replicas` may be missing during the rollout | 25%, rounded **down** |

Both are `IntOrString`, so `2` and `"50%"` are both legal in the same
slot and mean different things — a percentage is resolved against
`replicas` and follows the Deployment when it is resized, which is why
this question asked for counts.

The pair asked for here is the no-capacity-dip setting:
`maxUnavailable: 0` says no old Pod may be removed until a replacement is
Ready, and `maxSurge: 2` is what makes that possible by allowing the
replacements to be created alongside. Watch it and the Deployment goes to
four Pods before it goes back to two:

```bash
k -n reticulum get pod -w
```

They cannot both be zero — the API rejects that, since nothing could ever
move — which is also why the defaults round in opposite directions: 25%
of 2 replicas is 0 unavailable and 1 surge, never 0 and 0.

## If you patch before you create the class

This is the failure worth recognising, because it does not look like a
failure. The Deployment accepts a `priorityClassName` naming a class that
does not exist; it is the **Pods** that are refused, one by one, by the
admission plugin:

```bash
k -n reticulum describe rs -l app=checkout-api
```

```
Warning  FailedCreate  ...  Error creating: pods "checkout-api-..." is forbidden:
no PriorityClass with name q22-critical was found
```

Meanwhile `maxUnavailable: 0` is doing exactly what you asked it to: the
old Pods stay up, the service is fine, and `kubectl get deploy` shows
2/2 ready. Only `rollout status` hanging, and the ReplicaSet's events,
say that the new generation never got off the ground. Create the class
and the ReplicaSet's next retry succeeds on its own — there is nothing to
re-patch.
