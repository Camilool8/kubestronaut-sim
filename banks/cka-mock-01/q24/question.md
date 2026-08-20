Namespace `norma` holds the audit trail of a settlement service that was
decommissioned last quarter. The service's PersistentVolumeClaim went with
it. The PersistentVolume it was bound to, `q24-audit-pv`, was provisioned
`Retain`, so it is still there and still holds the data — it has been
`Released` ever since, and every claim written against it since has stayed
`Pending`.

Compliance wants the trail back in front of the `audit-viewer` Deployment,
on the original volume.

1. Make `q24-audit-pv` bindable again **without deleting it**. The volume
   must end up `Bound`, and it must still be the same object: ConfigMap
   `q24-inventory` in `norma` is the storage team's provisioning record for
   it and the audit compares the live volume against that record, so a
   replacement created under the same name does not pass — and
   `kubectl replace --force` is a delete. Do not edit the ConfigMap, and
   leave the volume's reclaim policy `Retain`.

2. In `norma`, create a PersistentVolumeClaim named `audit-data` that binds
   **that** volume and no other: class `q24-audit`, `1Gi`,
   `ReadWriteOnce`.

3. Mount `audit-data` into the `audit-viewer` Deployment at `/srv/audit`,
   in place of the empty scratch volume that is there now. Keep the mount
   path. With the Pod running, `cat /srv/audit/audit.log` inside it must
   print the retained trail.

```bash
k get pv q24-audit-pv
k -n norma get pvc,pod
k -n norma logs deploy/audit-viewer --tail=2
```
