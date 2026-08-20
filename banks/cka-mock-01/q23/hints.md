## Hint 1

Four objects, and they only work as a chain: the class is what the volume
and the claim both name so they can find each other, and the Pod is what
finally sets the binding in motion. Build them in that order and check
after each one — `kubectl get sc,pv` and `kubectl -n mensa get pvc`.

Expect the claim to sit `Pending` after step 3. Nothing is wrong: the
class binds on the first consumer, so the claim waits for a Pod. Do not
go looking for a fault there, and do not switch the class to `Immediate`
to make the word `Bound` appear — a volume that exists on exactly one
node wants the scheduler to choose first.

There is no `kubectl create` generator for a StorageClass, a
PersistentVolume or a PersistentVolumeClaim. The examples in the
documentation under Concepts → Storage are the fastest way in; copy one
and edit it rather than typing the shapes from memory.

## Hint 2

The class needs exactly two fields beyond its name: `provisioner`, whose
value says that nothing provisions this class (`kubectl explain
sc.provisioner` spells it), and `volumeBindingMode`. Both are immutable —
if you get one wrong, delete the class and create it again.

The volume needs four things: `spec.capacity.storage`,
`spec.accessModes`, `spec.storageClassName` matching the class, and
`spec.local.path` — the directory on the node, not a path on your own
machine. Then `spec.nodeAffinity`, which is what a `local` volume has
instead of a node name: it is `required` (never `preferred`), and it
matches label `kubernetes.io/hostname` with operator `In` and the node's
real name as its one value. `kubectl get nodes` prints the names the API
answers to. The API server refuses a `local` volume without it, so a
rejection on `apply` usually means that block, its indentation, or a
`preferred` where `required` belongs.

The claim only has to name the same class and ask for no more storage,
and no other access mode, than the volume offers. Then the Pod: a
`volumes:` entry with `persistentVolumeClaim.claimName: report-data`, and
a `volumeMounts:` entry in the container whose `name` is that volume's
name — not the claim's — with `mountPath: /data`. Watch the claim flip to
`Bound` as the Pod is scheduled, then read the file.
