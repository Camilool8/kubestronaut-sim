## Hint 1

Read the volume before changing anything: `kubectl get pv q24-audit-pv -o yaml`.

`Released` is not a phase a volume works its way out of. It means the volume
is still *reserved for* a claim — the reservation is a field on the volume,
it is still filled in, and `Retain` is the policy that says nobody may clear
it automatically. That is why every claim written against this volume has
stayed `Pending`: the volume is not free to be given to anyone.

Look at what that field says, then look at what you are being asked to
create. They have the same name. That is not enough, and the field itself
shows you the extra thing a reservation is made of.

## Hint 2

`spec.claimRef` is the reservation, and it pairs a volume with one specific
claim by `uid` — the identifier the API server issues when an object is
created. A brand-new claim called `audit-data` is a different claim to the
one recorded there, so recreating it by name changes nothing.

Clearing the field is what releases the reservation, and a merge patch is
how a field is removed: `null` deletes it, `{}` does not.

```bash
kubectl patch pv <name> --type=merge -p '{"spec":{"claimRef": ...}}'
kubectl edit pv <name>      # same thing by hand: delete the claimRef block
```

Once it is gone the volume goes `Available` and ordinary binding takes over,
so the claim has to match it: same class, capacity no larger than the
volume's, same access mode. `spec.volumeName` on the claim names the volume
outright if you want no doubt about which one it takes.

Deleting the volume and creating a new one over the same directory is not a
route to the same place, however identical the result looks — read step 1
again. The manual reclaim procedure in the documentation (delete the volume,
clean up the storage asset, create a new volume over it) is the recipe for
recycling a disk whose contents are finished with; the section you want is
the one about *reserving* a volume, which is where `claimRef` is explained. Leave `persistentVolumeReclaimPolicy: Retain` where it is: with the
claim you are about to bind, `Delete` would take the trail with it the next
time anyone tidies up.

For the Deployment, the volume entry is what changes, not the mount:
`spec.template.spec.volumes` swaps `emptyDir` for `persistentVolumeClaim`,
and the container's `volumeMounts` entry stays exactly as it is.
