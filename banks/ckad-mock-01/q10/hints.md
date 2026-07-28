## Hint 1

"Survive the deletion of any claim that binds it" is one field on the
PV with three possible values.

Naming a storage class on both sides is what stops the default
provisioner stepping in and binding your claim to a volume it made
itself.

## Hint 2

`persistentVolumeReclaimPolicy: Retain` on the PV.

Both objects need `storageClassName: manual` — if you leave it off the
PVC, the default class wins and it binds to something else entirely.

Check with `kubectl -n orion get pvc archive-pvc` — `STATUS` must be
`Bound` and `VOLUME` must be `archive-pv`, not a generated name.
