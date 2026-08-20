## Hint 1

Everything here happens on the `aux-etcd` node, not on the machine you are
typing on: `ssh cka-aux-etcd` first, and stay there until the cluster comes
back. `/opt/backup` is a directory on that node.

Do the two halves in the order the task lists them. The snapshot of "the
cluster as it is now" can only be taken while that cluster is still the one
running — the moment you put the old snapshot under etcd, the state you were
asked to keep is gone.

Two files on the node tell you almost everything you need:

- `/etc/kubernetes/manifests/etcd.yaml` — the etcd static Pod. Its `command:`
  lists the client URL and the certificate paths etcd itself uses, and its
  `volumes:` says which directory on the node holds the data.
- the snapshot at `/opt/backup/etcd-nightly.db`, which is just a file. Ask a
  tool what is in it before you trust it.

On etcd 3.6 those are two different tools. `etcdctl` talks to a *running* etcd
over the network, so it needs endpoints and certificates. `etcdutl` works on
files on disk, so it needs neither. If a subcommand answers you with its own
help text, you are holding the wrong one.

## Hint 2

Save, from the node. `snapshot save` is a client call to a live server, so it
needs the endpoint and three certificate flags — and the manifest's own
`--trusted-ca-file`, `--cert-file` and `--key-file` are exactly the files to
put in them:

```bash
etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=<ca> --cert=<server cert> --key=<server key> \
  snapshot save /opt/backup/etcd-before-restore.db
```

Without those flags etcd refuses the connection and no file is written at all.

Restore into a directory that **does not exist yet** — `etcdutl` refuses to
write into one that does, and this is a restore, not a merge:

```bash
etcdutl snapshot restore /opt/backup/etcd-nightly.db --data-dir <a new directory>
```

That only writes files. Nothing is using them yet. What makes etcd pick them up
is the last edit: in `/etc/kubernetes/manifests/etcd.yaml`, the volume named
`etcd-data` has a `hostPath.path` — point that at your new directory. Change
the host side only; the `mountPath` and the `--data-dir` flag describe the path
*inside* the container and stay as they are.

You do not restart etcd by hand. The kubelet is watching that directory, sees
the file change, and recreates the Pod; the API server then reconnects to the
new etcd on its own. Give it a minute or two, then

```bash
k --kubeconfig ~/.kube/aux-etcd -n q26-fleet get cm fleet-registry -o yaml
```

Ask for it **by name**, as above. `get cm` with no name can come back listing
nothing at all on a cluster whose restore worked perfectly, and it is worth
knowing why: a restore moves etcd's revision *backwards*, and the API server
decides whether its cache is current by comparing revisions. A cache filled
before the restore therefore concludes it is already ahead and keeps serving
what it held. Lists are answered from that cache; a GET of a named object goes
to etcd.

So the last step of a restore is to restart the API server, which is a real
part of the job rather than a trick — every controller that lists is reading
that same stale cache until you do. On the node, move its manifest out of
`/etc/kubernetes/manifests` and back, and the kubelet builds a new one:

```bash
mv /etc/kubernetes/manifests/kube-apiserver.yaml /tmp/
# watch crictl ps until the container is gone, then put the file back
```

**Last**, though — not first. Let the etcd Pod finish coming back before you
take the API server away, and confirm it by name:

```bash
k --kubeconfig ~/.kube/aux-etcd -n kube-system get pod etcd-aux-etcd-control-plane
```

The kubelet replaces that Pod's record in two calls, a delete and a create,
about seventy seconds after your edit. An API server that vanishes between
those two calls leaves the create failing and the kubelet does not retry it:
the Pod then does not exist at all, and `systemctl restart kubelet` on the node
is what brings it back.

If the API never comes back, the etcd container is starting and dying — on the
node, `crictl ps -a | head` and `crictl logs <id>` name the reason.
