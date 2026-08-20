# Solution 12

## Work on the right cluster

Everything below is the `aux-cni` cluster, never the one your other tasks use.
Give it a shell of its own and the rest of the commands stay short:

```bash
export KUBECONFIG=~/.kube/aux-cni
kubectl get nodes
# NAME                    STATUS     ROLES           AGE   VERSION
# aux-cni-control-plane   NotReady   control-plane   6m    v1.35.5
```

## Read the condition, not the status column

`NotReady` on its own says nothing. The condition behind it names the cause:

```bash
kubectl describe node aux-cni-control-plane | sed -n '/Conditions:/,/Addresses:/p'
# Ready   False   KubeletNotReady   container runtime network not ready:
#   NetworkReady=false reason:NetworkPluginNotReady
#   message:Network plugin returns error: cni plugin not initialized
```

That is a cluster with no pod network. Kubernetes does not ship one:
`kubeadm init` brings up the control plane and stops there, and `kind` does
the same when it is told not to install its own. Everything else you can see
is downstream of it:

```bash
kubectl get pod -A
# NAMESPACE     NAME                                            READY   STATUS    ...
# kube-system   coredns-...                                     0/1     Pending
# kube-system   coredns-...                                     0/1     Pending
# kube-system   etcd-aux-cni-control-plane                      1/1     Running
# kube-system   kube-apiserver-aux-cni-control-plane            1/1     Running
# kube-system   kube-proxy-...                                  1/1     Running
# q12-probe     client-...                                      0/1     Pending
# q12-probe     outsider-...                                    0/1     Pending
# q12-probe     web-...                                         0/1     Pending
```

The control plane is up because those are static Pods on the host network —
they never needed a pod network. Everything that does need one is `Pending`,
because the node lifecycle controller taints a NotReady node
`node.kubernetes.io/not-ready:NoSchedule` and the scheduler honours it:

```bash
kubectl get node aux-cni-control-plane -o jsonpath='{.spec.taints}' ; echo
# [{"effect":"NoSchedule","key":"node.kubernetes.io/not-ready"},
#  {"effect":"NoExecute","key":"node.kubernetes.io/not-ready"}]
```

`NoExecute` alongside `NoSchedule` is why the seeded Pods are not merely
unscheduled but unassigned: nothing gets to sit on this node and wait.

One cause, three symptoms. Removing that taint by hand would let Pods be
scheduled onto a node that still cannot give them an address, which trades
`Pending` for `ContainerCreating` and fixes nothing.

## Get to the manifest

Nothing here has to be fetched, and nothing has to be chosen: the plugin is
staged on the cluster's node — manifest and images both — and you have a root
login to it:

```bash
ssh cka-aux-cni
```

You are now on `aux-cni-control-plane` itself. `kubectl` is on the node's
`PATH`, and a `kubeadm` control plane keeps its admin credentials at
`/etc/kubernetes/admin.conf`:

```bash
ls /opt/packages/
# calico.yaml

kubectl --kubeconfig /etc/kubernetes/admin.conf apply -f /opt/packages/calico.yaml
# poddisruptionbudget.policy/calico-kube-controllers created
# serviceaccount/calico-node created
# configmap/calico-config created
# customresourcedefinition.apiextensions.k8s.io/... created      (many)
# clusterrole.rbac.authorization.k8s.io/calico-node created
# daemonset.apps/calico-node created
# deployment.apps/calico-kube-controllers created
exit
```

The alternative reads the file over the same login and applies it from the
instance. It is the same set of objects, and only the result is graded:

```bash
ssh cka-aux-cni cat /opt/packages/calico.yaml \
  | kubectl --kubeconfig ~/.kube/aux-cni apply -f -
```

Whichever you use, say which cluster you mean. A manifest applied without
`--kubeconfig` from an instance shell goes to your main cluster, which is not
where the problem is.

## Wait for the thing that actually changes the node

```bash
export KUBECONFIG=~/.kube/aux-cni
kubectl -n kube-system rollout status daemonset/calico-node --timeout=180s
# daemon set "calico-node" successfully rolled out
```

The DaemonSet is the right thing to watch because it is the thing doing the
work. Its Pod runs an init container that copies the CNI binaries into
`/opt/cni/bin` and writes a configuration into `/etc/cni/net.d` on the node it
lands on; the kubelet re-reads that directory, stops reporting the runtime
network as uninitialised, and flips its own Ready condition. The taint goes
with it, automatically.

Watch the order, because it is the opposite of what you would guess. The node
goes `Ready` within a few seconds of the apply — as soon as the configuration
file lands — and the DaemonSet finishes rolling out a few seconds *after*
that. A Ready node is therefore not proof that the plugin is up, which is why
this task grades the two separately and why the command above is the one to
block on rather than a `get nodes` loop. Once it returns, the rest follows:

```bash
kubectl get nodes
# NAME                    STATUS   ROLES           AGE   VERSION
# aux-cni-control-plane   Ready    control-plane   9m    v1.35.5

kubectl get pod -A
# every Pending Pod above is now Running — CoreDNS takes another half-minute
# to settle, the seeded Deployments come up as soon as they are scheduled
```

The images this manifest asks for were staged into the node's container store
when the cluster was built, so none of this waits on a download. A Pod in
`ImagePullBackOff` on this cluster is asking for an image nobody staged.

## Prove the network, do not assume it

`Running` means a sandbox got an address. It does not yet mean packets cross
between Pods, and it says nothing at all about policy. Both are graded, so
check both:

```bash
web=$(kubectl -n q12-probe get pod -l app=web -o jsonpath='{.items[0].status.podIP}')

# Pod to Pod, no Service and no DNS in the way
kubectl -n q12-probe exec deploy/client -- wget -q -T 3 -O- "http://${web}:8080/"
# web-ok

# the Service name: CoreDNS, kube-proxy and the pod network, all at once
kubectl -n q12-probe exec deploy/client -- \
  wget -q -T 3 -O- http://web.q12-probe.svc.cluster.local:8080/
# web-ok

# and the policy, which is the reason this plugin and not another one
kubectl -n q12-probe exec deploy/outsider -- wget -q -T 3 -O- "http://${web}:8080/"
# wget: download timed out          <- the correct answer
```

That last one is the point of the task. `web-allow-client` was in the
Namespace before you started:

```bash
kubectl -n q12-probe get netpol web-allow-client -o jsonpath='{.spec}' | jq
# {
#   "ingress": [{"from": [{"podSelector": {"matchLabels": {"app": "client"}}}],
#                "ports": [{"port": 8080, "protocol": "TCP"}]}],
#   "podSelector": {"matchLabels": {"app": "web"}},
#   "policyTypes": ["Ingress"]
# }
```

The API server stores that object on any cluster, whatever its network plugin
can do with it. Enforcing it is a plugin's job, and not every plugin takes it:
on a cluster running one that does not implement the API, this policy is
accepted, appears in `kubectl get netpol`, and blocks precisely nothing — the
`outsider` request above would return `web-ok` and nothing anywhere would warn
you. Choosing a plugin is choosing which of the APIs your cluster advertises
are real.

Note that a denied packet is dropped rather than refused, which is why every
probe above carries `-T 3`. Without a timeout the client waits for a handshake
that is never coming, and "the policy works" looks identical to "the terminal
has hung".

## What this looks like on a real cluster

The shape is the same on `kubeadm` outside a lab, and the two details worth
carrying away are the ones that bite there too:

- **The pod CIDR has to agree.** The manifest staged here already carries
  `CALICO_IPV4POOL_CIDR: 10.244.0.0/16`, matching the `podSubnet` this cluster
  was built with. Where they disagree, the plugin hands out addresses from a
  range the cluster does not route, Pods come up `Running` with an address, and
  nothing reaches anything — a failure that looks like everything working.
- **Install the network before you go looking for anything else.** A cluster
  with no CNI presents as a scheduler problem, a DNS problem and an addon
  problem at the same time, and all three clear on their own the moment the
  real cause is fixed.
