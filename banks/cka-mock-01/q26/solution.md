# Solution 26

## Two clusters, and only one of them is at risk

`aux-etcd` is a cluster of its own, one node, with its own API server and its
own etcd. Your default context still points at the main cluster, so nothing you
type here can hurt it:

```bash
k --kubeconfig ~/.kube/aux-etcd get nodes
# NAME                     STATUS   ROLES           AGE   VERSION
# aux-etcd-control-plane   Ready    control-plane   14m   v1.35.5

k --kubeconfig ~/.kube/aux-etcd -n q26-fleet get cm
# NAME               DATA   AGE
# kube-root-ca.crt   1      14m
```

The Namespace is there and the ConfigMap is not — `kube-root-ca.crt` is put in
every Namespace by the controller manager and is not what you are after. Its data was never anywhere
else, so this is not a question you can answer with `kubectl create`.

Everything from here happens on the node:

```bash
ssh cka-aux-etcd
```

## Read the manifest before you touch anything

The etcd that this cluster runs is a static Pod — a file on the node's disk
that the kubelet turns into a Pod. It is also the documentation for every value
you are about to type:

```bash
grep -E 'listen-client-urls|cert-file|key-file|trusted-ca-file|data-dir' \
  /etc/kubernetes/manifests/etcd.yaml
#     - --cert-file=/etc/kubernetes/pki/etcd/server.crt
#     - --data-dir=/var/lib/etcd
#     - --key-file=/etc/kubernetes/pki/etcd/server.key
#     - --listen-client-urls=https://127.0.0.1:2379,https://172.18.0.2:2379
#     - --trusted-ca-file=/etc/kubernetes/pki/etcd/ca.crt
```

and, at the bottom of the same file, where that data actually lives on the
node:

```yaml
  volumes:
  - hostPath:
      path: /etc/kubernetes/pki/etcd
      type: DirectoryOrCreate
    name: etcd-certs
  - hostPath:
      path: /var/lib/etcd          # <- the host directory
      type: DirectoryOrCreate
    name: etcd-data
```

Two paths with the same spelling and different meanings: `--data-dir` and the
`mountPath` are inside the container, the `hostPath` is on the node. Only the
last one is yours to change.

## 1. Save what you have now

`snapshot save` is an ordinary client call to a running etcd, so it needs the
endpoint and the certificates — the ones the manifest just showed you:

```bash
etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  snapshot save /opt/backup/etcd-before-restore.db
# {"level":"info","msg":"saved","path":"/opt/backup/etcd-before-restore.db"}
# Snapshot saved at /opt/backup/etcd-before-restore.db
# Server version 3.6.0
```

It takes well under a second and lands about 14 MB. Check it, because a file
with the right name is not the same thing as a snapshot:

```bash
etcdutl -w json snapshot status /opt/backup/etcd-before-restore.db
# {"hash":36842089,"revision":9902,"totalKey":1081,"totalSize":13664256,"version":"3.6.0"}
```

Leave that file where it is. Together with the directory etcd is using now, it
is your way back if the restore goes wrong — and it is the first thing this
question is scored on.

## 2. Restore the nightly backup into a new directory

```bash
etcdutl snapshot restore /opt/backup/etcd-nightly.db --data-dir /var/lib/etcd-restore
# {"level":"info","msg":"restoring snapshot", ...}
# {"level":"info","msg":"restored snapshot","path":"/opt/backup/etcd-nightly.db"}

ls /var/lib/etcd-restore/member
# snap  wal
```

Two things about that command:

- it is `etcdutl`, not `etcdctl`. On etcd 3.6 the offline half of the tooling
  moved out: `etcdctl` keeps `snapshot save`, which needs a live server, while
  `snapshot status` and `snapshot restore` — which only ever read a file —
  belong to `etcdutl`. `etcdctl snapshot status` on this version answers with
  the `snapshot` help text and a non-zero exit, which is easy to misread as a
  broken file.
- the target directory must not exist. `etcdutl` refuses to restore over one,
  which is deliberate: a restore replaces a keyspace and half-merging it into
  an existing member's files would produce something neither old nor new. On a
  second attempt, either remove the directory you made or restore into a new
  name.

Nothing has changed for the cluster yet. All you have done is write files into
a directory nobody is reading.

## 3. Point the static Pod at it

Edit `/etc/kubernetes/manifests/etcd.yaml` and change the **host** side of the
`etcd-data` volume:

```yaml
  - hostPath:
      path: /var/lib/etcd-restore
      type: DirectoryOrCreate
    name: etcd-data
```

Leave `--data-dir` and the `volumeMounts` entry alone. Inside the container the
data is still at `/var/lib/etcd`; you have changed which directory of the node
is mounted there.

Then stop typing. The kubelet watches that directory, notices the file changed,
and recreates the Pod — there is no `kubectl apply` for a static Pod (the API
copy is a read-only mirror) and no `systemctl restart` needed for the kubelet
itself.

## 4. Wait for the cluster to come back

The API server has just lost its database. Whether it restarts over that
depends on how long etcd is away — its liveness probe has to fail several times
in a row first — so the `ATTEMPT` column below may read `1`, or it may still
read `0` on a cluster that came back quickly. Either is fine here; step 5 is
where it starts to matter. Give it a minute or two. From the node:

```bash
crictl ps | grep -E 'etcd|apiserver'
# 8a41c0d8e3f21  ...  Running  etcd            0  ...
# 3b90a1f7c4d55  ...  Running  kube-apiserver  1  ...
```

Do not judge the cluster by its readiness endpoint while you wait:

```bash
k --kubeconfig ~/.kube/aux-etcd get --raw /readyz
# [-]etcd-readiness failed: reason withheld
```

That answer persists for about another minute after ordinary requests are
already being served, which is why the check for this question asks the API a
real question — `get ns` — instead. `/livez` is the one that tracks whether the
API server itself is alive.

And from your instance, the answer to the question — asked for **by name**:

```bash
k --kubeconfig ~/.kube/aux-etcd -n q26-fleet get cm fleet-registry -o yaml
# apiVersion: v1
# data:
#   region: eu-west-3
#   serial: 7f3c9a21d4e8
# kind: ConfigMap
# ...
```

## 5. Restart the API server, and know why

Ask for the same Namespace's ConfigMaps as a *list* at this point and you may
get a flat contradiction:

```bash
k --kubeconfig ~/.kube/aux-etcd -n q26-fleet get cm
# NAME               DATA   AGE
# kube-root-ca.crt   1      6m
```

Nothing is wrong with the restore. A restore moves etcd's revision *backwards*,
and the API server's watch cache decides whether it is current by comparing
revisions: a cache filled before the restore concludes it is already ahead of
etcd and keeps serving what it held, for as long as that process runs. Lists
are answered from that cache. A GET of a named object is not — it goes to
etcd, which is why the read above told the truth.

It is not only `kubectl` that is affected. Every controller in the cluster
lists, so every one of them is reconciling against the state you replaced.
Restarting the API server is the last step of the restore rather than a
workaround, and on the node it is one move:

```bash
mv /etc/kubernetes/manifests/kube-apiserver.yaml /tmp/ && sleep 10
mv /tmp/kube-apiserver.yaml /etc/kubernetes/manifests/
```

Wait for the etcd Pod before you do it, and check that by name too:

```bash
k --kubeconfig ~/.kube/aux-etcd -n kube-system get pod etcd-aux-etcd-control-plane \
  -o jsonpath='{.spec.volumes[?(@.name=="etcd-data")].hostPath.path}'
# /var/lib/etcd-restore-1755701234
```

The restored keyspace still describes the etcd Pod as it was before your edit,
so the kubelet has to replace that record — a delete followed by a create,
about seventy seconds after the manifest changed. Those are two separate calls
to the API server. Take the API server away between them and the create fails
with `unexpected EOF`; the kubelet does not try again, because its own record
still names the pod it just deleted. The Pod is then missing altogether — the
containers keep running, but nothing in the API describes them, and the
criterion that reads the data directory has nothing to read. `systemctl restart
kubelet` on the node is the way back.

The kubelet builds a new API server with an empty cache, and the two kinds of
read agree again:

```bash
k --kubeconfig ~/.kube/aux-etcd -n q26-fleet get cm
# NAME               DATA   AGE
# fleet-registry     2      18m
# kube-root-ca.crt   1      6m
```

The `AGE` column is worth a second look: the object is as old as it was when
the snapshot was taken, because it is not a new object. That is the difference
between a restore and a re-creation, and it is the difference the grader reads
— it checks the data the ConfigMap carries, which nobody who typed it out by
hand could have known.

## What a restore actually does to the rest of the cluster

The whole keyspace goes back, not just the object you were after. Anything
created *after* the snapshot — a Pod you started while you were looking around,
a Namespace you made for scratch — is not in the restored data and is gone.
Kubernetes copes with that: the kubelet re-registers the node, controllers
reconcile what they find, and the containers that were running keep running,
because they are the kubelet's business and not etcd's.

It is also why nothing you read straight after a restore should be trusted as a
clock. The etcd Pod you just caused to be recreated reads as ten minutes old
with zero restarts, because its record came out of the snapshot as well.

That is why the first step exists. `/opt/backup/etcd-before-restore.db` is the
only record of the state you replaced.

## If etcd does not come back

Work from the node, and read the container rather than guessing:

```bash
crictl ps -a | head
crictl logs <the etcd container id> 2>&1 | tail -20
```

| What you see | What it usually is |
|---|---|
| No etcd container at all, not even exited | The kubelet could not parse the manifest — a YAML indentation slip in the edit. `journalctl -u kubelet -n 20` says so |
| etcd starts and exits immediately, complaining about the data directory | The `hostPath` points somewhere the restore never wrote. Check the spelling against `ls -d /var/lib/etcd*` |
| etcd is Running but `kubectl` still fails | Give the API server a minute; it backs off between retries. `crictl logs` on the apiserver container tells you whether it is still refusing etcd |

The way back is the pair you kept: point the `hostPath` at the original
directory again and the cluster returns to the state it was in when you
started — minus nothing, because that directory was never written to.

## Why not `kubectl exec` into the etcd Pod

It is the reflex — the etcd image carries `etcdctl`, and on a healthy cluster
`k -n kube-system exec etcd-... -- etcdctl ... snapshot save` does work for the
*save*. It is useless for everything after it: `kubectl exec` is a call to the
API server, the API server needs etcd, and the whole point of a restore is that
etcd is not there. A restore is done from the node's own shell, with tools that
live on the node — which is why `etcdctl` and `etcdutl` are on this node's
`PATH` at all.
