# Solution 5

## Aim at the right cluster

`aux-sched` is a cluster of its own, with its own kubeconfig and its own node.
The default kubeconfig always means the main cluster, so every command in this
task carries `--kubeconfig`:

```bash
export KUBECONFIG=~/.kube/aux-sched     # or --kubeconfig on every command
k get nodes
# NAME                      STATUS   ROLES           AGE   VERSION
# aux-sched-control-plane   Ready    control-plane   14m   v1.35.5
```

One node, `Ready`, with no taints on it — a single-node kind cluster runs
workloads on its control plane. So "no room" is not the explanation for what
follows.

```bash
k get pod -o wide
# NAME                             READY   STATUS    NODE     NOMINATED NODE
# orbit-planner-7d9c6f8b45-4kq2m   0/1     Pending   <none>   <none>
# orbit-planner-7d9c6f8b45-c8vlp   0/1     Pending   <none>   <none>
# orbit-planner-7d9c6f8b45-zt7wx   0/1     Pending   <none>   <none>
```

## The silence is the clue

```bash
k describe pod -l app=orbit-planner | tail -1
# Events:  <none>

k get pod -l app=orbit-planner \
  -o jsonpath='{range .items[*]}{.metadata.name}{"  node="}{.spec.nodeName}{"  conditions="}{.status.conditions}{"\n"}{end}'
# orbit-planner-7d9c6f8b45-4kq2m  node=  conditions=
# orbit-planner-7d9c6f8b45-c8vlp  node=  conditions=
# orbit-planner-7d9c6f8b45-zt7wx  node=  conditions=
```

No events, an empty `.spec.nodeName`, and no `PodScheduled` condition at all —
not even a `False` one. That is the difference worth internalising:

| What you see on a Pending Pod | What it means |
|---|---|
| `FailedScheduling` events, `0/1 nodes are available: …` | A scheduler looked at this Pod and could not place it. The fault is in the Pod's requirements or the nodes |
| No events, no `PodScheduled` condition, `NOMINATED NODE` empty | **Nothing ever looked at it.** The fault is that there is no working scheduler |

Placing a Pod means writing a node name into `.spec.nodeName`, and exactly one
component does that. Nothing else in the control plane will do it for you, and
no amount of waiting helps.

## Find the scheduler

```bash
k -n kube-system get pods
# NAME                                              READY   STATUS             RESTARTS   AGE
# coredns-...                                       1/1     Running            0          14m
# etcd-aux-sched-control-plane                      1/1     Running            0          14m
# kube-apiserver-aux-sched-control-plane            1/1     Running            0          14m
# kube-controller-manager-aux-sched-control-plane   1/1     Running            0          14m
# kube-proxy-...                                    1/1     Running            0          14m
# kube-scheduler-aux-sched-control-plane            0/1     CrashLoopBackOff   7          13m
```

Note that the Pod's *phase* is still `Running` — a crash-looping container is a
Pod that is up and a container that is not:

```bash
k -n kube-system get pod kube-scheduler-aux-sched-control-plane \
  -o jsonpath='{.status.phase}{"  "}{.status.containerStatuses[*].state}{"\n"}'
# Running  {"waiting":{"message":"back-off 2m40s restarting failed container...","reason":"CrashLoopBackOff"}}
```

Grade yourself on `READY 0/1`, never on `STATUS: Running`.

## Read what it says on the way out

```bash
k -n kube-system logs -l component=kube-scheduler --tail=5
# E0820 09:14:22.113456       1 run.go:72] "command failed"
#   err="stat /etc/kubernetes/scheduler-backup.conf: no such file or directory"
```

The kubelet keeps the last dead container's log, so this works even though
nothing is running right now. The scheduler is being told to authenticate with a
file that does not exist, and it exits before it does anything else — before it
even takes the leadership Lease:

```bash
k -n kube-system get lease kube-scheduler
# Error from server (NotFound): leases.coordination.k8s.io "kube-scheduler" not found
```

## Fix the manifest on the node

A control-plane component on a kubeadm cluster is a **static Pod**: the kubelet
reads its manifest from a directory on the node's own disk and starts it
directly, with no scheduler and no controller involved. That is why the
scheduler can exist at all on a cluster that cannot schedule — and why the
repair is a file edit on the node, not an API call.

```bash
ssh cka-aux-sched
vi /etc/kubernetes/manifests/kube-scheduler.yaml
```

```yaml
    spec:
      containers:
      - command:
        - kube-scheduler
        - --authentication-kubeconfig=/etc/kubernetes/scheduler.conf
        - --authorization-kubeconfig=/etc/kubernetes/scheduler.conf
        - --bind-address=127.0.0.1
        - --kubeconfig=/etc/kubernetes/scheduler-backup.conf     # <-- wrong
        - --leader-elect=true
...
      volumes:
      - hostPath:
          path: /etc/kubernetes/scheduler.conf
          type: FileOrCreate
        name: kubeconfig
```

The two other `--*-kubeconfig` flags and the `volumes:` entry all name
`/etc/kubernetes/scheduler.conf`. One flag was changed and nothing else, which
is what makes it findable by eye once the log has told you which file to look
for. Put it back:

```yaml
        - --kubeconfig=/etc/kubernetes/scheduler.conf
```

Save and `exit`. Do **not** delete the manifest, and do not create a file called
`scheduler-backup.conf` to satisfy the flag: the kubeconfig the scheduler is
meant to use is the one this manifest mounts, and a second copy under another
name is a new problem rather than a repair.

## Watch it come back

The kubelet watches that directory and re-reads it on a short timer, so there is
nothing to restart. Within seconds it kills the old container and starts one
with the corrected command line:

```bash
k -n kube-system get pod -l component=kube-scheduler -w
# kube-scheduler-aux-sched-control-plane   0/1   CrashLoopBackOff   8   14m
# kube-scheduler-aux-sched-control-plane   0/1   Running            9   14m
# kube-scheduler-aux-sched-control-plane   1/1   Running            9   14m
```

`1/1` is the moment it passed its own `/livez` probe. It takes the Lease at
about the same time:

```bash
k -n kube-system get lease kube-scheduler -o jsonpath='{.spec.holderIdentity}{"\n"}'
# aux-sched-control-plane_1f0a2c4e-...
```

And the backlog clears on its own — no Pod was touched, nothing was re-created:

```bash
k get pod -o wide
# NAME                             READY   STATUS    NODE
# orbit-planner-7d9c6f8b45-4kq2m   1/1     Running   aux-sched-control-plane
# orbit-planner-7d9c6f8b45-c8vlp   1/1     Running   aux-sched-control-plane
# orbit-planner-7d9c6f8b45-zt7wx   1/1     Running   aux-sched-control-plane
```

Placement and startup are two separate steps and both are visible here: the
scheduler wrote a node into each Pod, and that node's kubelet then pulled the
image and started the container. Because the image is already in this cluster's
image store the second step is immediate; on a cluster that had to pull, you
would watch the Pods sit in `ContainerCreating` for a while with the scheduling
already done.

## The shortcuts that are not answers

| Shortcut | Why it is wrong |
|---|---|
| `k patch deploy orbit-planner` with `nodeName` on the Pod template | A Pod that names its own node is never given to a scheduler — the kubelet claims it directly. The Pods start, the cluster is exactly as broken as before, and the next workload anyone creates is Pending again |
| Writing a `Binding` for each Pending Pod by hand | The same, one Pod at a time. It is a real API and worth knowing about, but it is what the scheduler does *for* you, not a repair of it |
| `k scale deploy orbit-planner --replicas=0` | The Pending column empties and nothing has been fixed |
| Deleting `kube-scheduler.yaml` | The mirror Pod disappears, so does the log that told you what was wrong, and the cluster still does not schedule. The manifest directory is the only thing that starts a static Pod |

## Why a scheduler question is a troubleshooting question

Everything the exam asks about a broken control plane follows this path, and it
is worth having as a habit:

1. **Which cluster?** Aux tasks give you a second kubeconfig; the default one is
   the main cluster.
2. **What is the symptom, precisely?** Pending with a reason and Pending with no
   reason are two different faults.
3. **Is the component even there?** `-n kube-system get pods`. Ready counts,
   not phases.
4. **What does it say?** `logs` on a crash-looping Pod still works; the kubelet
   kept the dead container's output.
5. **Where does that component come from?** Static Pod, so
   `/etc/kubernetes/manifests/` on the node, edited in place. The kubelet picks
   the change up on its own.
