## Hint 1

Three objects, and only the first one is unusual. The class does not need
inventing: the cluster already has one that works, so read it and change
the two fields the question names.

```bash
k get sc
k get sc standard -o json | jq '{provisioner, reclaimPolicy, volumeBindingMode}'
```

A StorageClass is cluster-scoped — no namespace, and no `-n` on the
command that creates it.

Watch the default. `standard` is marked as the cluster's default class,
which means a claim that names no class at all still gets a volume, from
the wrong class. Name the class on the claim.

Do not copy the default marking across, either: it lives in an
annotation rather than in the spec, so `kubectl get sc standard -o yaml`
carries it and a copy-paste brings it along.

## Hint 2

The fields, by name:

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: q25-local-retain
provisioner: <the one standard uses>
reclaimPolicy: Retain
volumeBindingMode: WaitForFirstConsumer
```

`reclaimPolicy` and `volumeBindingMode` sit at the top level of a
StorageClass, next to `provisioner` — there is no `spec` on this kind at
all. `kubectl explain sc` will confirm it.

The claim goes in `crater` and names the class in
`spec.storageClassName`. Then mount it: a `volumes` entry on the Pod
template with a `persistentVolumeClaim.claimName`, and a `volumeMounts`
entry on the `web` container that refers to that volume by name with
`mountPath: /data`. `kubectl -n crater edit deploy archive` is the
shortest road — there is no `kubectl set` subcommand for volumes, so it
is an edit or a patch either way.

Expect `Pending` right up until the Deployment rolls a Pod that uses the
claim — `WaitForFirstConsumer` is doing exactly what it says. If it is
still Pending after that, read the claim's own events:

```bash
k -n crater describe pvc archive-data
```

And one ordering trap worth checking before you finish: a volume takes
its reclaim policy from the class when it is provisioned, and keeps its
own copy from then on. If something bound on the class while it still
said `Delete`, fixing the class now will not fix the volume — delete the
claim and make it again.
