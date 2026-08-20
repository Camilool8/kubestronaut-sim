Node `sim-worker3` is the cluster's maintenance worker. It is reserved: it
carries the taints `q07-maintenance=true:NoSchedule` and
`q07-maintenance=true:NoExecute`, so the only Pods on it are system DaemonSets
and workloads that explicitly tolerate everything.

Since the last maintenance window it has been reporting **NotReady**, and the
one workload of its own — Deployment `node-probe` in Namespace `q07-probe`, a
single replica pinned to the node by a `kubernetes.io/hostname` nodeSelector —
has been stuck `Pending` ever since, because there is nothing on that node
willing to start it.

Bring the node back into service:

1. Diagnose it from the node itself. You have root ssh to every node in this
   cluster: `ssh cka-worker3` lands on `sim-worker3`. `systemctl` and
   `journalctl` are both there.
2. Repair it, so that `sim-worker3` reports `Ready` again and the `node-probe`
   Pod runs on it.
3. Make the repair permanent. Getting the node back only until its next reboot
   is not enough — whatever you fix has to come up again on its own when the
   machine restarts, and that is graded separately from the node being Ready.

Leave the node reserved while you work: the two `q07-maintenance` taints stay,
and `node-probe` keeps its `kubernetes.io/hostname` pin — moving the probe
somewhere else would hide the very thing you were asked to fix. Do not delete
the Node object either; removing the record does not repair the machine, and
its kubelet would register it again moments later.

```bash
k get nodes
k -n q07-probe get pod -o wide
ssh cka-worker3
```
