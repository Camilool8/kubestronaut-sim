## Hint 1

Start by reading the cluster rather than by typing into it, and do it from
here — the node is where the work happens, but the API is where the answer is
measured:

```bash
k --kubeconfig ~/.kube/aux-upgrade get nodes
```

One node, `Ready`, and a `VERSION` a whole minor release below the rest of this
environment. That one column is two separate things reported as one. The
**control plane** is four static Pods on this node — etcd and the three
`kube-*` components — and `kubeadm` is what manages them. The **kubelet** is a
systemd unit, and `kubeadm` does not touch it at all. They are upgraded by two
different means, in that order, and the column only moves when the second one
is done.

The tool that does the first half has a rule worth knowing before you fight it:
`kubeadm` can upgrade a cluster to its own version, and no higher. So check what
you are actually running before you ask it for anything:

```bash
ssh cka-aux-upgrade
kubeadm version -o short
/opt/packages/kubeadm version -o short
```

Those two do not answer the same thing, and only one of them can do this job.
Run it by its full path, or put it where `kubeadm` is found first.

`kubeadm upgrade plan` is worth running for the table it prints — it names every
component and what it would become. Read it, but name the version you want
yourself rather than taking the one it recommends: it looks for the newest
release it can find, and the binaries here are for `v1.35.6`.

## Hint 2

The control plane, in one command, from the node:

```bash
/opt/packages/kubeadm upgrade apply v1.35.6
```

It asks for confirmation (`-y` skips the prompt), then takes the components in
turn — etcd, apiserver, controller-manager, scheduler — and waits for each one
to come back before starting on the next. Give it a couple of minutes, and
expect the API to be unreachable for part of it. It ends with
`SUCCESS! A control plane node of your cluster was upgraded to "v1.35.6"`.

Then the kubelet, which is a plain file swap and a service restart — with one
trap in it:

```bash
cp /opt/packages/kubelet /usr/bin/kubelet
```

> `cp: cannot create regular file '/usr/bin/kubelet': Text file busy`

The kubelet is *running*, and Linux will not let you write over the image of a
running process. Two ways past it, and both are fine:

- stop the unit first, copy, then start it again, or
- rename the new file into place (`mv`), which replaces the directory entry
  rather than writing through it, and works while the old binary is still
  executing.

After the swap:

```bash
systemctl daemon-reload
systemctl restart kubelet
kubelet --version
```

The node re-registers within a few seconds and the `VERSION` column follows.
If it does not, `systemctl status kubelet` and `journalctl -u kubelet -n 30`
say why — a kubelet that will not start leaves the node reporting the old
version, which looks exactly like a swap you forgot to do.

One last thing, if you drained the node before the swap: `kubectl uncordon
aux-upgrade-control-plane`. Nothing clears `SchedulingDisabled` on its own,
and a one-node cluster that will not schedule is not a cluster you have
finished upgrading.
