# Solution 25

**1. Find the provisioner.** The question does not name it because the
cluster already does. Every StorageClass names its provisioner in a
top-level field, so read the one that works:

```bash
k get sc
```

```
NAME                 PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION   AGE
standard (default)   rancher.io/local-path   Delete          WaitForFirstConsumer   false                  22m
```

`kubectl get sc` prints all four fields that matter here, which makes it
the fastest read in the question — no `-o yaml`, no `describe`. The
`(default)` beside the name is the annotation
`storageclass.kubernetes.io/is-default-class`, and it is the reason a
claim that names no class at all still gets a volume on this cluster.

`rancher.io/local-path` is the local-path provisioner that kind installs;
it runs as the Deployment `local-path-provisioner` in namespace
`local-path-storage`.

**2. Create the class.**

```bash
k apply -f - <<'EOF'
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: q25-local-retain
provisioner: rancher.io/local-path
reclaimPolicy: Retain
volumeBindingMode: WaitForFirstConsumer
EOF
```

Three things about that manifest are worth noticing.

There is no `spec`. A StorageClass is one of the few built-in kinds whose
fields sit directly on the object — `provisioner`, `reclaimPolicy`,
`volumeBindingMode`, `parameters`, `allowVolumeExpansion` — so writing
them under a `spec:` block produces an object with the defaults and no
error. `kubectl explain sc` shows the flat shape.

There is no namespace, because a StorageClass is cluster-scoped.

And there is no `is-default-class` annotation. Copying `standard` whole —
`k get sc standard -o yaml`, edit, apply under a new name — brings the
annotation with it, and a cluster with two default classes is a cluster
where new claims pick one arbitrarily.

**3. Create the claim.**

```bash
k apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: archive-data
  namespace: crater
spec:
  storageClassName: q25-local-retain
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
EOF
```

`storageClassName` is the whole point of the object here. Leave it out
and the claim is served by the default class, binds happily, and gives
you a volume that deletes itself the moment the claim goes — which looks
like a working answer right up until it isn't.

Look at it now and it is `Pending`:

```bash
k -n crater get pvc
```

```
NAME           STATUS    VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS       AGE
archive-data   Pending                                      q25-local-retain   5s
```

That is correct, and `describe` says why:

```
Events:
  Type    Reason                Message
  ----    ------                -------
  Normal  WaitForFirstConsumer  waiting for first consumer to be created before binding
```

**4. Mount it.**

```bash
k -n crater edit deploy archive
```

Two additions, one under `spec.template.spec.volumes` and one on the
container:

```yaml
    spec:
      containers:
        - name: web
          image: nginx:1.29-alpine
          volumeMounts:
            - name: data
              mountPath: /data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: archive-data
```

There is no `kubectl set` subcommand for volumes — `set` covers env,
image, resources, selector, serviceaccount and subject — so this is an
`edit`, an `apply` of a full manifest, or a patch. The patch form is
worth knowing because it merges the two lists by `name` rather than
replacing them:

```bash
k -n crater patch deploy archive --type=strategic -p '{
  "spec": {"template": {"spec": {
    "volumes": [{"name": "data", "persistentVolumeClaim": {"claimName": "archive-data"}}],
    "containers": [{"name": "web",
      "volumeMounts": [{"name": "data", "mountPath": "/data"}]}]}}}}'
```

The volume's `name` (`data` here) is local to the Pod and yours to
choose; it is the string the `volumeMounts` entry refers back to.
`claimName` is not yours to choose — it names the PersistentVolumeClaim,
never the PersistentVolume the claim ends up bound to.

**5. Watch it bind.**

```bash
k -n crater rollout status deploy/archive
k -n crater get pvc
k get pv
```

```
NAME           STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS       AGE
archive-data   Bound    pvc-9f2c1b40-7a55-4c0e-9c31-2a1e0f8b6d44   1Gi        RWO            q25-local-retain   50s
```

```
NAME                                       CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM                       STORAGECLASS       AGE
pvc-9f2c1b40-7a55-4c0e-9c31-2a1e0f8b6d44   1Gi        RWO            Retain           Bound    crater/archive-data         q25-local-retain   20s
```

`Retain` in the RECLAIM POLICY column is the answer to the question. It
is there because the class said so — nobody wrote it on the volume.

The PersistentVolume's name is `pvc-<uid>`, generated by the
provisioner. Nothing you do decides it, so nothing should depend on it.
The way to get from a claim to its volume is the claim itself:

```bash
k -n crater get pvc archive-data -o jsonpath='{.spec.volumeName}{"\n"}'
```

## Why the class waits for a consumer

`WaitForFirstConsumer` means the volume is not created when the claim is
created; it is created after a Pod that mounts the claim has been
scheduled, and it is created **on the node the scheduler picked**.

For a local-path provisioner that ordering is the whole design. The
volume is a directory on one machine — under `/var/local-path-provisioner`
on that node, made by a short-lived helper Pod — so the provisioner
cannot choose a directory until something has chosen a node. Look at what
it writes onto the volume:

```bash
k get pv "$(k -n crater get pvc archive-data -o jsonpath='{.spec.volumeName}')" \
  -o json | jq '{path: .spec.local.path, affinity: .spec.nodeAffinity}'
```

```json
{
  "path": "/var/local-path-provisioner/…",
  "affinity": {
    "required": {
      "nodeSelectorTerms": [
        {"matchExpressions": [
          {"key": "kubernetes.io/hostname", "operator": "In", "values": ["sim-worker"]}
        ]}
      ]
    }
  }
}
```

The base directory is not a property of the volume; it comes from the
provisioner's own configuration — `kubectl -n local-path-storage get cm
local-path-config -o jsonpath='{.data.config\.json}'` shows the
node-to-path map it was started with.

That `nodeAffinity` is binding from then on. Every future Pod using this
claim is constrained to that node, because the bytes are only there. It
is why `Immediate` is the wrong binding mode for storage of this kind:
the class would have the provisioner commit to a node first and leave the
scheduler to discover afterwards that it has no choice. The class kind
ships uses `WaitForFirstConsumer` for exactly the same reason.

The trade is real, not theoretical. Local storage is fast and it is
pinned. Drain the node this volume landed on and the Pod has nowhere to
go — a network-backed provisioner would have let it move.

## Where a reclaim policy actually lives

The field is on the class, and it is copied onto each volume as that
volume is provisioned. After that the volume owns its copy and the class
is out of the picture:

| | `Delete` | `Retain` |
|---|---|---|
| Claim deleted | volume object removed, data removed | volume stays, moves to `Released`, data untouched |
| Volume reusable by a new claim | n/a | not automatically — `claimRef` still names the old claim |

This is the part that catches people out under a clock. Create the claim
first, notice the class is wrong, fix the class — and the volume that
already bound still says `Delete`, because it was stamped before the fix.
`kubectl get pv` will show it plainly. The recovery is to start that
volume again:

```bash
k -n crater delete pvc archive-data      # the old PV goes Released
k apply -f pvc.yaml                      # a new claim provisions a new PV
```

Which is also the shortest demonstration of what `Retain` bought you: do
that on a `Delete` class and the volume and its contents are gone by the
time the command returns.

A `Released` volume is not free storage yet, either. Its `claimRef` still
points at the claim that has been deleted, and no new claim will bind to
it until someone clears that field or the volume is recreated. That
manual step is the price of `Retain`, and it is the point of it: nothing
throws the data away on your behalf.

## Reading a Pending claim

Three different faults all look like `Pending`, and the claim's events
tell them apart:

| Event | Means |
|---|---|
| `WaitForFirstConsumer` — waiting for first consumer | Working as designed. Nothing mounts the claim yet |
| `ProvisioningFailed` — storageclass.storage.k8s.io "…" not found | The `storageClassName` on the claim names a class that does not exist |
| Nothing at all, for a while | No controller has claimed it — usually a `provisioner` string no running controller answers to |

```bash
k -n crater describe pvc archive-data
k -n local-path-storage get pods
```

The second command is worth remembering. A dynamic claim is only as alive
as the controller behind its class, and that controller is an ordinary
Deployment in an ordinary namespace — it can be scaled to zero, evicted,
or stuck like anything else.
