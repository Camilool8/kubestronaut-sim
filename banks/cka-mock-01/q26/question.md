A second cluster called `aux-etcd` runs beside the main one, on a single node
of its own. Your default `kubectl` context does not point at it — reach its API
with the kubeconfig at `~/.kube/aux-etcd`, and log in to its node as root with
`ssh cka-aux-etcd`. Nothing you do to that cluster touches the main one.

Someone deleted ConfigMap `fleet-registry` from Namespace `q26-fleet` on
`aux-etcd`. Its contents are recorded nowhere else. The one copy that survives
is inside an etcd snapshot taken before the deletion, on the node at
`/opt/backup/etcd-nightly.db`.

Bring the ConfigMap back, from that snapshot:

1. **Before you change anything**, save a snapshot of the cluster's etcd *as it
   is now* to `/opt/backup/etcd-before-restore.db` on the node — the state you
   are about to replace is worth keeping. etcd listens on
   `https://127.0.0.1:2379` and the certificates it accepts are in
   `/etc/kubernetes/pki/etcd/`.
2. Restore `/opt/backup/etcd-nightly.db` into a **new data directory** on the
   node. Leave the directory etcd is using now where it is, and point the etcd
   static Pod at the restored one instead.
3. Finish with the cluster serving again and `fleet-registry` back in Namespace
   `q26-fleet` with the data it held. Do not re-create it by hand — you do not
   have its contents.

Both `/opt/backup` paths are on the `aux-etcd` node, not on this machine.
`etcdctl` and `etcdutl` are already on the node's `PATH`; this is etcd **3.6**,
where taking a snapshot and working on a snapshot file are no longer the same
binary.

The `aux-etcd` API server goes down while its etcd is being replaced, and
`kubectl --kubeconfig ~/.kube/aux-etcd` fails for as long as it is. That is
expected here — this cluster is yours to break, and bringing it back is the
task.

```bash
k --kubeconfig ~/.kube/aux-etcd -n q26-fleet get cm
ssh cka-aux-etcd
```

> **Legacy question.** etcd backup and restore was removed from the CKA
> blueprint in February 2025 — no etcd bullet remains in it, and etcd.io is not
> among the sites you may open during the exam. It is kept in this bank for
> full-experience parity with killer.sh, which still weights it, and because the
> skill outlives the exam objective.
