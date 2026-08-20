# Solution 7

## Read the condition before you go anywhere

```bash
k get nodes
# NAME                 STATUS     ROLES           AGE   VERSION
# sim-control-plane    Ready      control-plane   51m   v1.35.5
# sim-worker           Ready      <none>          50m   v1.35.5
# sim-worker2          Ready      <none>          50m   v1.35.5
# sim-worker3          NotReady   <none>          50m   v1.35.5
# sim-worker4          Ready      <none>          50m   v1.35.5
```

`NotReady` in that column is a summary. The condition underneath it says more:

```bash
k describe node sim-worker3 | sed -n '/Conditions:/,/Addresses:/p'
# Type             Status    LastHeartbeatTime  Reason              Message
# MemoryPressure   Unknown   ...                NodeStatusUnknown   Kubelet stopped posting node status.
# DiskPressure     Unknown   ...                NodeStatusUnknown   Kubelet stopped posting node status.
# PIDPressure      Unknown   ...                NodeStatusUnknown   Kubelet stopped posting node status.
# Ready            Unknown   ...                NodeStatusUnknown   Kubelet stopped posting node status.
```

**`Unknown`, not `False`** — and that distinction is the whole diagnosis. A
kubelet that finds a problem reports `Ready=False` with a reason of its own
(`KubeletNotReady`, `NetworkPluginNotReady`). `Unknown` with
`NodeStatusUnknown` is the *node controller* speaking: no status has arrived
for about forty-five seconds, so it has stopped guessing. Nothing on the node
told the cluster anything. Whatever is wrong, the machine is where it is.

The node controller has also tainted the node on its way past:

```bash
k get node sim-worker3 -o jsonpath='{range .spec.taints[*]}{.key}={.value}:{.effect}{"\n"}{end}'
# q07-maintenance=true:NoSchedule
# q07-maintenance=true:NoExecute
# node.kubernetes.io/unreachable=:NoSchedule
# node.kubernetes.io/unreachable=:NoExecute
```

The first two are the maintenance reservation and were already there. The
`unreachable` pair is automatic, added the moment Ready went `Unknown`, and it
will disappear on its own when the node comes back.

## The symptom the cluster can see

```bash
k -n q07-probe get pod -o wide
# NAME                          READY   STATUS    RESTARTS   AGE   IP       NODE          NOMINATED NODE
# node-probe-6d9c7f4b58-2xr4k   0/1     Pending   0          48m    <none>   sim-worker3   <none>
```

Read that carefully: `Pending`, but with a NODE. The scheduler did its job — the
probe carries a blanket toleration, so an unreachable node is still a legal
placement for it — and then handed the Pod to a machine with nothing on it to
take delivery. `Pending` with a node assigned means "scheduled, never started",
which is a different fault from `Pending` with `<none>`, and it points at the
node rather than at scheduling.

## On the node

```bash
ssh cka-worker3
```

`cka-worker3` is the login alias; the API knows the same machine as
`sim-worker3`. Both names work here — the instance's client config carries a row
for each.

```bash
systemctl status kubelet
# ○ kubelet.service - kubelet: The Kubernetes Node Agent
#      Loaded: loaded (/etc/systemd/system/kubelet.service; disabled; preset: enabled)
#     Drop-In: /etc/systemd/system/kubelet.service.d
#              └─10-kubeadm.conf, 11-kind.conf
#      Active: inactive (dead)
```

Two facts, on two lines, and you need both:

| Line | What it says | Which half of the fault |
|---|---|---|
| `Active: inactive (dead)` | the process is not running **now** | why the node is NotReady this minute |
| `Loaded: ...; disabled;` | the unit is not linked into any boot target | why it would not come back on its own after a reboot |

`journalctl` confirms there is no crash to chase:

```bash
journalctl -u kubelet --no-pager | tail -5
# ... Stopping kubelet: The Kubernetes Node Agent...
# ... kubelet.service: Deactivated successfully.
# ... Stopped kubelet: The Kubernetes Node Agent.
```

It was stopped, cleanly, by somebody. There is no bad flag, no full disk and no
certificate to renew — the service is simply switched off. That is worth
checking for before you start editing config: a kubelet that never started
leaves a very short journal, and a kubelet that starts and dies leaves a long
noisy one.

## The fix

```bash
systemctl enable --now kubelet
# Created symlink '/etc/systemd/system/multi-user.target.wants/kubelet.service' → '/etc/systemd/system/kubelet.service'.
```

One command, both halves — and the output names exactly what `enable` did that
`start` would not have.

```bash
systemctl is-enabled kubelet
# enabled
systemctl is-active kubelet
# active
exit
```

## Confirm from the cluster

```bash
k get node sim-worker3
# NAME          STATUS   ROLES    AGE   VERSION
# sim-worker3   Ready    <none>   52m   v1.35.5
```

Ready comes back within about five seconds of the service starting: the kubelet
posts its status immediately rather than waiting out a cycle. The `unreachable`
taints vanish with it, and the probe starts:

```bash
k -n q07-probe get pod -o wide
# NAME                          READY   STATUS    RESTARTS   AGE   IP             NODE
# node-probe-6d9c7f4b58-2xr4k   1/1     Running   0          52m   10.244.3.12    sim-worker3
```

Nothing rescheduled it. It is the same Pod, on the same node, that had been
waiting since the outage — the kubelet found a Pod already assigned to it,
pulled from the images already in the node's containerd, and started it.

## `start` is not `enable`, and this question grades both

The two verbs do genuinely different things, and only one of them writes
anything to disk:

| Command | Effect now | Effect after a reboot |
|---|---|---|
| `systemctl start kubelet` | runs the unit | nothing — the machine comes up with no kubelet |
| `systemctl enable kubelet` | nothing | creates `multi-user.target.wants/kubelet.service`, so systemd starts it at boot |
| `systemctl enable --now kubelet` | runs the unit | starts at boot |

`enable` is a symlink, and you can look at it:

```bash
ls -l /etc/systemd/system/multi-user.target.wants/
# containerd.service -> /etc/systemd/system/containerd.service
# kubelet.service -> /etc/systemd/system/kubelet.service
# ssh.service -> /lib/systemd/system/ssh.service
# undo-mount-hacks.service -> /etc/systemd/system/undo-mount-hacks.service
```

Had you only started the unit, that listing would come back with
`kubelet.service` missing and everything else present — the node Ready, the
probe Running, and the machine still one reboot away from going NotReady again.
That is the state the second criterion here exists to catch, and it is why the
task says the repair has to be permanent.

The grader reads that same directory, but it does not log into the node to do
it: `node-probe` mounts the node's `/etc/systemd/system` as a read-only
`hostPath`, so a `kubectl exec` into the Pod can list it. That is also why the
probe has to stay pinned to `sim-worker3` — a probe re-homed onto a healthy
worker would faithfully report that *that* machine's kubelet is enabled.

## Things that look like fixes and are not

- **`k delete node sim-worker3`.** The node disappears from `get nodes`, which
  can be mistaken for progress. It changes nothing on the machine, and a live
  kubelet re-registers within seconds — so on a node whose kubelet is dead, the
  entry simply stays gone, taking the only record of the outage with it.
- **Removing the `q07-maintenance` taints.** They are not why the node is
  NotReady; they are the reservation that keeps everything except the probe off
  it. Removing them lets unrelated workloads schedule onto a machine that is in
  a maintenance window.
- **Editing `node-probe`.** Dropping the hostname pin does turn the Pod green,
  on a different machine. The Pending Pod is a symptom, and moving a symptom is
  not repairing a fault.
- **`k uncordon` / `k taint ... -`.** Neither touches `.status`. `Ready` is
  reported by the node, not set on it; there is no API call that makes a node
  Ready.

## The general shape of "node NotReady"

Worth carrying out of this question, because the kubelet being switched off is
only the friendliest case:

| What `describe node` shows | Where to look |
|---|---|
| `Ready Unknown`, `Kubelet stopped posting node status` | the node. Is `kubelet` active? Is the machine reachable at all? |
| `Ready False`, `KubeletNotReady`, `container runtime not ready` | the container runtime on the node — `systemctl status containerd`, `crictl info` |
| `Ready False`, `cni plugin not initialized` | the CNI: no config in `/etc/cni/net.d`, or the CNI DaemonSet is not running there |
| `Ready True` but Pods will not start | not the node — look at the scheduler, the taints and the Pod's own events |

And in every one of those cases, once the service is running again, check
whether it will still be running after a reboot. `systemctl is-enabled` is one
word long and it is the difference between a fix and a postponement.
