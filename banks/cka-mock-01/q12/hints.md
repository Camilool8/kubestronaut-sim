## Hint 1

Start by making the cluster tell you what it is missing, rather than reading
`NotReady` as "broken":

```bash
export KUBECONFIG=~/.kube/aux-cni
kubectl describe node | sed -n '/Conditions:/,/Addresses:/p'
```

The Ready condition carries its own explanation, and it names the thing that
is absent: the container runtime's network is not ready because the CNI
plugin was never initialised. A Kubernetes cluster does not come with a pod
network — `kubeadm` and `kind` alike leave that to you, and everything else
you can see here is a consequence of it. The node is tainted
`node.kubernetes.io/not-ready:NoSchedule` by the node lifecycle controller, so
the scheduler has nowhere to place anything, so CoreDNS and the seeded
Deployments sit `Pending`. One cause, three symptoms.

Nothing on that list is fixed by hand. Removing the taint, deleting the Pods
or restarting the kubelet all leave the cause exactly where it was.

The manifest that fixes it is not on this instance. It is staged on the
cluster's node, at `/opt/packages/calico.yaml`, with the images it asks for
already in that node's container store — so there is nothing to fetch and
nothing to choose. You have a root login there.

## Hint 2

`ssh cka-aux-cni` puts you on the node. `kubectl` is on its `PATH` and the
cluster's admin credentials are in the usual place for a `kubeadm` control
plane:

```bash
kubectl --kubeconfig /etc/kubernetes/admin.conf apply -f /opt/packages/calico.yaml
```

If you would rather stay on the instance, bring the file to you instead —
either end applies the same objects, and only the result is graded. Name the
kubeconfig every time you do it from here, or the manifest lands on the wrong
cluster:

```bash
ssh cka-aux-cni cat /opt/packages/calico.yaml > calico.yaml
kubectl --kubeconfig ~/.kube/aux-cni apply -f calico.yaml
```

Then wait for it properly rather than watching `get nodes` in a loop. The node
goes `Ready` a few seconds before the plugin has finished installing itself,
so the DaemonSet is the thing to block on:

```bash
export KUBECONFIG=~/.kube/aux-cni
kubectl -n kube-system rollout status ds/calico-node
kubectl get nodes && kubectl get pod -A
```

The images this manifest asks for are already in the node's container store,
so nothing here is waiting on a download; if a Pod is in `ImagePullBackOff`,
it is asking for an image nobody staged.

Two things to confirm before you call it done, because the task is graded on
both. The seeded Pods in `q12-probe` must reach `Running` on their own — you
do not create or restart them. And the NetworkPolicy already in that
Namespace must actually bite: from the `client` Pod the `web` Service answers
on 8080, and from the `outsider` Pod it must not.

```bash
web=$(kubectl -n q12-probe get pod -l app=web -o jsonpath='{.items[0].status.podIP}')
kubectl -n q12-probe exec deploy/client   -- wget -q -T 3 -O- "http://${web}:8080/"
kubectl -n q12-probe exec deploy/outsider -- wget -q -T 3 -O- "http://${web}:8080/"
```
