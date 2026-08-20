Node `sim-worker4` goes down for a kernel upgrade in a few minutes.

That node is set aside for one workload. It carries the taint
`q06-dedicated=telemetry:NoSchedule`, and the only Pods on it that are not
system DaemonSets belong to Deployment `telemetry-collector` in Namespace
`aquila`: two replicas, pinned to the node by a `kubernetes.io/hostname`
nodeSelector, spooling to an `emptyDir` whose contents are scratch and
expendable.

Prepare the node for the maintenance window:

1. Make `sim-worker4` unschedulable, so nothing new is placed on it.
2. Evacuate it: when you are done, no Pod may be left running on
   `sim-worker4` except the ones managed by DaemonSets, which stay by design.
3. Leave the workload itself alone. `telemetry-collector` must still exist in
   `aquila` with **2** replicas and the same `kubernetes.io/hostname`
   nodeSelector.

Its Pods will end up `Pending` — they are pinned to a node that no longer
accepts Pods, so there is nowhere for them to go until the node comes back.
That is the correct end state for this task: do not "fix" it by editing the
Deployment, and do not make the node schedulable again.

All of this is done with `kubectl` against the cluster API. There is no host
to log into — a node is emptied through the API, not from its own shell.

```bash
k get nodes
k -n aquila get pod -o wide
```
