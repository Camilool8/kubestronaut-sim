This task is on `aux-sched`, a second single-node cluster that runs beside the
main one. It has its own kubeconfig and its own node, and nothing you do to it
touches the main cluster:

```bash
kubectl --kubeconfig ~/.kube/aux-sched get nodes
ssh cka-aux-sched     # root on that cluster's only node
```

Since a change to its control plane this morning, `aux-sched` places nothing.
Deployment `orbit-planner` in Namespace `default` asks for **3** replicas and
all three of its Pods are `Pending`, on a node with ample room for them.

1. Work out why the cluster is not placing Pods, and repair it. The fault is
   on the node, in the static Pod manifest directory `/etc/kubernetes/manifests/`
   that the kubelet reads — and it is fixed by correcting the file that is
   wrong, not by removing it.
2. Leave the control plane in the shape you found it: when you are done,
   `kube-scheduler` must be back as a static Pod of that node, `Running` and
   `Ready` in Namespace `kube-system`.
3. `orbit-planner` must end up with its 3 Pods placed on the node and
   `Running`. The cluster has to place them itself — do not pin them with a
   `nodeName` and do not bind them by hand.

Leave `orbit-planner` otherwise as it is: 3 replicas, same image, no node
pinning added to its Pod template.
