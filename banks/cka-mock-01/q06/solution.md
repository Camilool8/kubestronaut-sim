# Solution 6

## Look before you empty it

```bash
k get node sim-worker4
# NAME           STATUS   ROLES    AGE   VERSION
# sim-worker4    Ready    <none>   42m   v1.35.0

k get pod -A -o wide --field-selector spec.nodeName=sim-worker4
# NAMESPACE     NAME                                   READY   STATUS    NODE
# aquila        telemetry-collector-6c8b7d5f49-4pq2m   1/1     Running   sim-worker4
# aquila        telemetry-collector-6c8b7d5f49-t8xzr   1/1     Running   sim-worker4
# kube-system   calico-node-9wq6h                      1/1     Running   sim-worker4
# kube-system   kube-proxy-2sl4c                       1/1     Running   sim-worker4
```

Four Pods: the two you were told about, and two that belong to DaemonSets.
That split is the whole shape of the task.

## The command

```bash
k drain sim-worker4
```

It refuses, and the refusal is the lesson:

```text
node/sim-worker4 cordoned
error: unable to drain node "sim-worker4" due to error: [cannot delete
DaemonSet-managed Pods (use --ignore-daemonsets to ignore): kube-system/calico-node-9wq6h,
kube-system/kube-proxy-2sl4c, cannot delete Pods with local storage (use
--delete-emptydir-data to override): aquila/telemetry-collector-6c8b7d5f49-4pq2m,
aquila/telemetry-collector-6c8b7d5f49-t8xzr], continuing command...
```

Two categories of Pod it will not move on its own, each named with the flag
that covers it. Note the first line: the node was **cordoned** before the
first eviction was attempted, and it stays cordoned even though the command
then failed. Add the two flags:

```bash
k drain sim-worker4 --ignore-daemonsets --delete-emptydir-data
# node/sim-worker4 already cordoned
# Warning: ignoring DaemonSet-managed Pods: kube-system/calico-node-9wq6h, kube-system/kube-proxy-2sl4c
# evicting pod aquila/telemetry-collector-6c8b7d5f49-4pq2m
# evicting pod aquila/telemetry-collector-6c8b7d5f49-t8xzr
# node/sim-worker4 drained
```

`drained` is printed only once every Pod it took responsibility for is
actually gone — drain waits, it does not fire and forget.

## What each flag is really saying

| Flag | The Pod it unblocks | Why drain will not decide for you |
|---|---|---|
| `--ignore-daemonsets` | `calico-node`, `kube-proxy` | A DaemonSet places one Pod per node. Evict it and the controller puts it straight back, so the drain would never finish. They are left running, and that is correct: the CNI and kube-proxy are what keep the node's networking alive while it is being emptied |
| `--delete-emptydir-data` | `telemetry-collector` | An `emptyDir` lives on this node's disk and is destroyed with the Pod. Losing it is a data decision, not a scheduling one, so it is yours to make |
| `--force` | a Pod with no controller | Nothing recreates a bare Pod, so evicting it deletes the workload outright. Nothing in this exercise needs it |

## Confirm

```bash
k get node sim-worker4
# NAME          STATUS                     ROLES    AGE   VERSION
# sim-worker4   Ready,SchedulingDisabled   <none>   43m   v1.35.0

k get node sim-worker4 -o jsonpath='{.spec.unschedulable}{"\n"}'
# true

k get pod -A -o wide --field-selector spec.nodeName=sim-worker4
# NAMESPACE     NAME                READY   STATUS    NODE
# kube-system   calico-node-9wq6h   1/1     Running   sim-worker4
# kube-system   kube-proxy-2sl4c    1/1     Running   sim-worker4
```

`SchedulingDisabled` in the STATUS column is `.spec.unschedulable` being
`true`. It is a field on the Node object, which is why cordoning is an API
call and not something you log into the machine to do — nothing in this
question needs ssh at all.

## The Pending Pods are the answer, not a fault

```bash
k -n aquila get pod -o wide
# NAME                                   READY   STATUS    NODE     NOMINATED NODE
# telemetry-collector-6c8b7d5f49-9j4kt   0/1     Pending   <none>   <none>
# telemetry-collector-6c8b7d5f49-lmr7v   0/1     Pending   <none>   <none>

k -n aquila describe pod -l app=telemetry-collector | tail -4
# Events:
#   Warning  FailedScheduling  ...  0/5 nodes are available: 1 node(s) were
#   unschedulable, 3 node(s) didn't match Pod's node affinity/selector, 1 node(s)
#   had untolerated taint ...
```

The exact tally depends on what else the cluster is doing, but the shape does
not: every node is rejected, and the one node the selector allows is rejected
for being unschedulable.

Eviction is a delete that goes through the eviction API, so the ReplicaSet
sees itself two Pods short and asks for replacements immediately. The
replacements are placed under the rules that apply *now*, and those rules
leave exactly one node they are allowed on — `sim-worker4`, by the hostname
nodeSelector — which no longer accepts Pods. So they wait.

That is the honest outcome of draining a node a workload is pinned to, and it
is what the task asked for. Two ways of making the yellow go away both undo
the work:

- deleting the pin, which moves the collector onto hardware that was never
  provisioned for it and hides whether the node was ever drained;
- `k uncordon sim-worker4`, which re-opens the node you were asked to close;
  the Pods come back within seconds, onto a machine that is about to be
  rebooted.

After the real maintenance window, `k uncordon sim-worker4` is exactly the
right command and the collector returns on its own. Not before.

## Why cordon alone is not enough, and delete is not either

```bash
k cordon sim-worker4     # marks it unschedulable — and moves nothing
```

`unschedulable` is consulted when the scheduler is *choosing* a node, and
never again, so every Pod already on the node keeps running. The same is true
of the `q06-dedicated=telemetry:NoSchedule` taint that was already there: a
`NoSchedule` taint evicts nothing (`NoExecute` is the effect that does), and
this workload tolerates it anyway.

Reaching for `k delete pod` instead of draining looks equivalent for a
Deployment and is not:

- it deletes rather than evicts, so PodDisruptionBudgets — the mechanism a
  workload uses to say "never take more than one of me at a time" — are
  ignored outright;
- without a cordon first, the replacements can be scheduled straight back
  onto the node you are trying to empty;
- it is per-Pod, so nothing tells you about the DaemonSet Pods, the local
  storage, or the Pod that no controller would ever replace.

`kubectl drain` is one command that cordons, refuses to guess, and waits.
