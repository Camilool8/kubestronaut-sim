# Solution 13

A kubeadm upgrade is two jobs that look like one. The `VERSION` column of
`kubectl get nodes` reports the **kubelet**, and the kubelet is a systemd unit
and a binary on the node that `kubeadm` never touches. The **control plane** —
apiserver, controller-manager, scheduler, etcd — runs as static Pods whose
manifests `kubeadm` owns. You upgrade the control plane first, with `kubeadm`,
and the kubelet second, by hand. The column only moves when the second one is
done, which is why an upgrade that stops after `kubeadm upgrade apply` looks
like nothing happened at all.

## Read it first

```bash
k --kubeconfig ~/.kube/aux-upgrade get nodes
# NAME                        STATUS   ROLES           VERSION
# aux-upgrade-control-plane   Ready    control-plane   v1.34.8
```

One node, and it is the control plane. Everything else happens over the login
alias:

```bash
ssh cka-aux-upgrade
```

## The tool has to be new enough

`kubeadm` upgrades a cluster to its own version and no higher. The one installed
on this node came with it:

```bash
kubeadm version -o short
# v1.34.8
/opt/packages/kubeadm version -o short
# v1.35.6
```

So the staged binary is the one that runs. Either call it by its path, as below,
or put it where `kubeadm` is found first — on the real exam the equivalent step
is `apt-mark unhold kubeadm && apt-get install -y kubeadm=1.35.6-*`, which is the
same idea with a package manager doing the copy:

```bash
cp /opt/packages/kubeadm /usr/bin/kubeadm    # optional; nothing is running it
```

## Plan, then name your own version

```bash
/opt/packages/kubeadm upgrade plan
```

The table it prints is the useful part: every component, what it is on now, what
it would become, and whether any component configuration needs migrating
(`MANUAL UPGRADE REQUIRED: no` for both kube-proxy's and the kubelet's config
here, which is what makes this a clean jump).

What is *not* useful is its recommendation. `upgrade plan` looks for the newest
release it can reach and offers you that, plus the newest patch of the version
you are already on. Follow it here and you will aim at a version this
environment has no binaries and no images for, and the upgrade will fail
somewhere in the middle rather than at the start. The staged version is
`v1.35.6`; ask for it by name.

## The control plane

```bash
/opt/packages/kubeadm upgrade apply v1.35.6 -y
```

Roughly two and a half minutes, and worth watching. It renews the control-plane
certificates, records the new version in the cluster's kubeadm configuration,
and then replaces the static Pod manifests one component at a time — etcd first,
then apiserver, controller-manager, scheduler — waiting for each to come back
before it starts the next. The apiserver is unreachable for part of that, which
is normal and not something to react to.

```
[upgrade] SUCCESS! A control plane node of your cluster was upgraded to "v1.35.6". Enjoy!
[upgrade] Now please proceed with upgrading the kubelet if you haven't already done so.
```

That last line is the whole of the second half. From the instance:

```bash
k --kubeconfig ~/.kube/aux-upgrade get nodes
# NAME                        STATUS   ROLES           VERSION
# aux-upgrade-control-plane   Ready    control-plane   v1.34.8
```

Still `v1.34.8` — and correctly so. The control plane is on the new version and
the kubelet is not.

## Empty the node

```bash
k --kubeconfig ~/.kube/aux-upgrade drain aux-upgrade-control-plane \
  --ignore-daemonsets --delete-emptydir-data
```

This node runs only cluster add-ons and they have nowhere else to go on a
one-node cluster, so they sit Pending until the uncordon at the end. On a real
cluster this is the step that keeps a restarting kubelet from taking your
workload down with it, and it is in the documented order for that reason. The
static Pods are not affected: drain skips mirror Pods, and the control plane
keeps serving throughout.

Do it from wherever you like — the node has its own admin kubeconfig at
`/etc/kubernetes/admin.conf` if you would rather not leave the shell:

```bash
export KUBECONFIG=/etc/kubernetes/admin.conf
```

## The kubelet, and the trap in it

```bash
cp /opt/packages/kubelet /usr/bin/kubelet
# cp: cannot create regular file '/usr/bin/kubelet': Text file busy
```

That is not a permissions problem and not a mount problem. The kubelet is
running, and Linux refuses to write over the executable image of a running
process. The package-manager path on a real exam hides this, because dpkg
unlinks the old file and creates a new one rather than writing through the
existing one.

Two ways past it, and either is fine:

```bash
# stop the unit first
systemctl stop kubelet
cp /opt/packages/kubelet /usr/bin/kubelet
```

```bash
# or replace the directory entry, which works against a running binary
cp /opt/packages/kubelet /usr/bin/kubelet.new && mv /usr/bin/kubelet.new /usr/bin/kubelet
```

Stopping the kubelet does not stop the cluster: the container runtime is what
keeps the static Pods up, and it does not care that the kubelet went away for a
few seconds.

`kubectl` on the node is upgraded alongside it — same version skew rules, and
the docs pair them:

```bash
cp /opt/packages/kubectl /usr/bin/kubectl
```

Then reload systemd and start it again:

```bash
systemctl daemon-reload
systemctl restart kubelet
kubelet --version
# Kubernetes v1.35.6
```

`daemon-reload` is in the procedure because an upgrade can change the unit's
drop-in configuration; on a run where nothing changed it costs nothing. The node
re-registers within a few seconds of the kubelet coming back, and that
re-registration is what carries the new version to the API.

If the version does not move, the kubelet did not start:

```bash
systemctl status kubelet
journalctl -u kubelet -n 30 --no-pager
```

## Schedulable again

```bash
k --kubeconfig ~/.kube/aux-upgrade uncordon aux-upgrade-control-plane
```

Nothing clears `spec.unschedulable` on its own. A cordoned node is `Ready`,
reports the new version, and refuses every Pod the scheduler offers it — on a
one-node cluster, that is an upgraded cluster that runs nothing.

## What it should read afterwards

```bash
k --kubeconfig ~/.kube/aux-upgrade get nodes
# NAME                        STATUS   ROLES           VERSION
# aux-upgrade-control-plane   Ready    control-plane   v1.35.6

k --kubeconfig ~/.kube/aux-upgrade version
# Server Version: v1.35.6

k --kubeconfig ~/.kube/aux-upgrade -n kube-system get pods -l tier=control-plane \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].image}{"\n"}{end}'
# etcd-aux-upgrade-control-plane                     registry.k8s.io/etcd:3.6.6-0
# kube-apiserver-aux-upgrade-control-plane           registry.k8s.io/kube-apiserver:v1.35.6
# kube-controller-manager-aux-upgrade-control-plane  registry.k8s.io/kube-controller-manager:v1.35.6
# kube-scheduler-aux-upgrade-control-plane           registry.k8s.io/kube-scheduler:v1.35.6
```

Three separate facts, and they fail separately. The node's `VERSION` is the
kubelet's own report, which only changes once the new binary is the running one.
`version` is what the apiserver says about itself, which is the half `kubeadm`
did. The Pod images are the rest of the control plane: `upgrade apply` moves all
of them, and a run that was interrupted — or an upgrade done by hand-editing one
manifest — leaves the apiserver ahead of the other two. etcd is on its own
numbering and `kubeadm` picks it for you; it is not something to match against
the Kubernetes version.

Anything at or above `v1.35.6` counts here. If you had a way to reach a newer
patch release and took `upgrade plan`'s advice all the way, that is still a
cluster that was upgraded correctly.
