This task is on a **separate cluster**. `aux-cni` is a single-node cluster of
its own: its kubeconfig is at `~/.kube/aux-cni`, and you log in to its node as
root with `ssh cka-aux-cni`. Nothing you do here touches the cluster your other
tasks use.

It was built with no pod network at all. The node is `NotReady`, it carries
the `node.kubernetes.io/not-ready` taint, and everything the scheduler is
handed stays `Pending` — including a workload seeded in Namespace
`q12-probe`, which has never started:

- Deployment `web` (`app=web`) serves HTTP on port **8080**, behind Service
  `web` on the same port.
- Deployments `client` (`app=client`) and `outsider` (`app=outsider`) are
  idle shells to test from.
- NetworkPolicy `web-allow-client` is already there: the `app=web` Pods
  accept TCP `8080` from the `app=client` Pods, and from nothing else.

A network plugin is staged for you at `/opt/packages/calico.yaml` — on the
cluster's **node**, not on this instance — and its container images are
already loaded into that node's container store, so nothing about the install
has to be fetched. The node also holds its own admin credentials at
`/etc/kubernetes/admin.conf`. Calico is the plugin staged here, and it is the
one this task wants: the Namespace's NetworkPolicy has to be **enforced**, not
merely stored, and a plugin that does not implement the API would leave it
accepted and inert.

Give `aux-cni` a pod network.

1. Install the staged plugin into the cluster. The manifest is on the node,
   so getting to it is part of the task.
2. Finish with the node `Ready` and the plugin's own DaemonSet rolled out on
   it.
3. Finish with the seeded workload actually running, and the policy actually
   enforced: from a `client` Pod, `web` answers on `8080` both by Pod address
   and by its Service name; from an `outsider` Pod it does not answer at all.

Leave the contents of `q12-probe` alone. The Deployments, the Service and the
NetworkPolicy are the instrument this task is measured with, not part of what
you change.

```bash
kubectl --kubeconfig ~/.kube/aux-cni get nodes
kubectl --kubeconfig ~/.kube/aux-cni describe node
kubectl --kubeconfig ~/.kube/aux-cni get pod -A -o wide
```

Typing that flag on every command gets old. Give the aux cluster its own
shell instead:

```bash
export KUBECONFIG=~/.kube/aux-cni
```
