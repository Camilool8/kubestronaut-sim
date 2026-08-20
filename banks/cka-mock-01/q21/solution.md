# Solution 21

## Read what decides the placement today

```bash
k -n octans get pod -o wide
# NAME                            READY   STATUS    RESTARTS   AGE   NODE
# batch-runner-6b7c9d5f8c-9x2ql   1/1     Running   0          4m    sim-worker
# batch-runner-6b7c9d5f8c-tw6nd   1/1     Running   0          4m    sim-worker
# web-frontend-7d9f4c6b55-4kk8p   1/1     Running   0          4m    sim-worker
# web-frontend-7d9f4c6b55-cz7rj   1/1     Running   0          4m    sim-worker

k -n octans get deploy batch-runner \
  -o jsonpath='{.spec.template.spec.nodeSelector}{"\n"}'
# {"kubernetes.io/hostname":"sim-worker"}
```

Everything is on one node because both Pod templates name it. That pin is
the thing being replaced.

## Reserve the node

Two separate fields, written with two separate commands:

```bash
k taint nodes sim-worker2 workload=batch:NoSchedule
# node/sim-worker2 tainted

k label nodes sim-worker2 workload=batch
# node/sim-worker2 labeled
```

```bash
k get node sim-worker2 \
  -o jsonpath='{.spec.taints}{"\n"}{.metadata.labels.workload}{"\n"}'
# [{"effect":"NoSchedule","key":"workload","value":"batch"}]
# batch
```

They are opposites, which is why the task needs both:

| | What it does | Who reads it |
|---|---|---|
| Taint `workload=batch:NoSchedule` | Keeps every Pod **off** the node unless the Pod tolerates it | The scheduler, on the node side |
| Label `workload=batch` | Gives the node a name a Pod can **ask for** | The Pod's nodeSelector or node affinity |

A taint on its own makes a node nobody uses. A label on its own makes a
node anybody can use. Together they make one nothing else lands on and
one thing does.

## Move `batch-runner`

Three edits to the same Pod template: drop the pin, add the toleration,
add the requirement.

```bash
k -n octans edit deploy batch-runner
```

```yaml
    spec:
      # nodeSelector:                      <- delete these two lines
      #   kubernetes.io/hostname: sim-worker
      tolerations:
        - key: workload
          operator: Equal
          value: batch
          effect: NoSchedule
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: workload
                    operator: In
                    values: [batch]
      containers:
```

The same thing without an editor, which is quicker under a clock — note
`null`, the only way a merge patch deletes a field:

```bash
k -n octans patch deploy batch-runner --type=merge -p '{
  "spec": {"template": {"spec": {
    "nodeSelector": null,
    "tolerations": [{"key": "workload", "operator": "Equal",
                     "value": "batch", "effect": "NoSchedule"}],
    "affinity": {"nodeAffinity": {"requiredDuringSchedulingIgnoredDuringExecution": {
      "nodeSelectorTerms": [{"matchExpressions": [
        {"key": "workload", "operator": "In", "values": ["batch"]}]}]}}}
  }}}
}'
```

A `nodeSelector` of `workload: batch` is accepted in place of the node
affinity — it is the same requirement in fewer lines. Node affinity is
worth writing at least once because it is the form that can express
`In`, `NotIn`, `Exists` and a preference; a nodeSelector can only ever
say "this label, this value".

## Confirm

```bash
k -n octans rollout status deploy/batch-runner
# deployment "batch-runner" successfully rolled out

k -n octans get pod -o wide
# NAME                            READY   STATUS    RESTARTS   AGE   NODE
# batch-runner-5c4d7fb9d6-8jd4v   1/1     Running   0          25s   sim-worker2
# batch-runner-5c4d7fb9d6-pn9sz   1/1     Running   0          22s   sim-worker2
# web-frontend-7d9f4c6b55-4kk8p   1/1     Running   0          9m    sim-worker
# web-frontend-7d9f4c6b55-cz7rj   1/1     Running   0          9m    sim-worker
```

## Why nothing moved until the template changed

`NoSchedule` is a rule about **new** placements. It is consulted when the
scheduler is choosing a node and never again, so it evicts nothing: had
you tainted `sim-worker2` while `batch-runner` was already running there,
those Pods would have carried on running untouched.

The Pods here moved for the ordinary reason — the Pod template changed,
so the Deployment rolled out a new ReplicaSet, and its Pods were placed
under the new rules. The order of the three commands does not matter, but
the outcome in between does: patch the Deployment before labelling the
node and the new Pod has nowhere to go, so it sits `Pending` while the
old Pods keep running and the rollout never finishes. Label the node and
it schedules within seconds — nothing needs re-doing.

`NoExecute` is the effect that does evict, immediately and cluster-wide
for every Pod on that node without a matching toleration. It is not what
this task asked for, and reaching for it here would have thrown the web
tier off any node you applied it to.

## The three ways this half-works

| What you wrote | What happens |
|---|---|
| Toleration only | The Pods are *allowed* on `sim-worker2` and are still free to go anywhere else. They land wherever the scheduler prefers — usually not the node you just emptied |
| Affinity only | The Pods are *required* to be on `sim-worker2` and are refused by its taint. They stay `Pending`, and `describe pod` says `had untolerated taint {workload: batch}` |
| Both, pin left in place | `nodeSelector` and node affinity are AND-ed, so the template asks for a node that is both `sim-worker` and labelled `workload=batch`. No node is both. `Pending` again |

Permission and requirement are different questions, and a dedicated node
needs an answer to each.

## Leave `web-frontend` alone

The reservation is doing its job precisely because `web-frontend` has no
toleration: from the moment the taint is on, nothing of the web tier can
be scheduled onto `sim-worker2`, and that is the whole point of the
arrangement. Adding the toleration to every workload in the Namespace
"so nothing breaks" undoes it — the node goes back to being an ordinary
worker that batch work happens to prefer.

```bash
k -n octans get pod -l app=web-frontend -o wide
# both still on sim-worker, untouched
```
