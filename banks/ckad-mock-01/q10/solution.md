# Solution 10

Three objects, applied in one go. Note `storageClassName: manual` on
**both** the PV and the PVC — that pairing is what binds them to each
other instead of letting the cluster's default provisioner step in.

```bash
k apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolume
metadata:
  name: archive-pv
spec:
  capacity:
    storage: 2Gi
  accessModes: [ReadWriteOnce]
  persistentVolumeReclaimPolicy: Retain
  storageClassName: manual
  hostPath:
    path: /mnt/archive
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: archive-pvc
  namespace: orion
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: manual
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: archiver
  namespace: orion
spec:
  volumes:
    - name: archive
      persistentVolumeClaim:
        claimName: archive-pvc
    - name: scratch
      emptyDir: {}
  containers:
    - name: web
      image: nginx:1.29-alpine
      volumeMounts:
        - name: archive
          mountPath: /var/archive
        - name: scratch
          mountPath: /var/scratch
EOF
```

Check the binding before anything else — everything downstream depends
on it:

```bash
k -n orion get pvc archive-pvc
# NAME          STATUS   VOLUME       CAPACITY   ACCESS MODES   STORAGECLASS
# archive-pvc   Bound    archive-pv   2Gi        RWO            manual

k -n orion get pod archiver
```

Note the capacity column says `2Gi`, not `1Gi`: a claim asks for a
*minimum*, and binding to a larger volume gives you the whole thing.

## When the claim stays Pending

That is the failure mode here, and `describe` names the cause:

```bash
k -n orion describe pvc archive-pvc
```

The usual reasons:

- **Class mismatch.** Omit `storageClassName` on the PVC and it gets the
  *default* class, which provisions a brand-new volume and ignores yours.
  Setting it to `manual` — a class no provisioner claims — is what forces
  static binding.
- **The claim asks for more than the volume has.** 1Gi against a 2Gi
  volume is fine; 4Gi would never bind.
- **Access modes do not overlap.** `ReadWriteMany` against an RWO volume
  never binds.

## Retain

`persistentVolumeReclaimPolicy: Retain` means deleting the claim leaves
the volume — and its data — in place, in `Released` state, for an admin
to deal with. The default for a statically created PV is also `Retain`,
but dynamically provisioned ones usually get `Delete`, which removes the
underlying storage with the claim. Spelling it out is the habit worth
having.

## emptyDir alongside

`scratch` shares the Pod's lifetime, not the node's: it is created empty
when the Pod is scheduled and is gone when the Pod is. That is the point
of having both here — one volume that outlives the Pod, one that does
not.
