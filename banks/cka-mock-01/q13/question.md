A second cluster runs alongside the main one for maintenance work. It is called
`aux-upgrade`, it has a single node — a control plane that also runs workloads —
and it was built one minor version behind everything else here. Nothing on the
main cluster is part of this question.

You can reach it two ways, and you will need both:

```bash
# the API, from this machine
k --kubeconfig ~/.kube/aux-upgrade get nodes

# the node itself, as root
ssh cka-aux-upgrade
```

The node's real name — the one the API knows it by — is
`aux-upgrade-control-plane`.

Upgrade that cluster to **v1.35.6** with `kubeadm`.

1. Upgrade the control plane to `v1.35.6`.
2. Upgrade the node's own `kubelet` to `v1.35.6` and get it running, so the node
   reports the new version to the API.
3. Leave the node `Ready` and schedulable when you are done.

Everything the upgrade needs is already on the node:

- `/opt/packages/kubeadm`, `/opt/packages/kubelet` and `/opt/packages/kubectl`,
  all at `v1.35.6`. The `kubeadm` that is installed on the node is the old one
  and will not apply an upgrade to a version above itself.
- The `v1.35.6` control-plane images, already in the node's container runtime.

`kubeadm upgrade plan` may offer you versions other than `v1.35.6` — a newer
patch release, or the newest patch of the version you are on. `v1.35.6` is the
one this environment has binaries and images for, so it is the one to ask for by
name.
