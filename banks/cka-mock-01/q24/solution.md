# Solution 24

## Read the volume first

```bash
k get pv q24-audit-pv -o jsonpath='{.status.phase}{"\n"}'
# Released

k get pv q24-audit-pv \
  -o jsonpath='{.spec.claimRef.namespace}/{.spec.claimRef.name} {.spec.claimRef.uid}{"\n"}'
# norma/audit-data 6c1f0a52-0d3e-4f9a-9a2e-5f0f2b7c81d4   (yours will differ)

k -n norma get pvc audit-data
# Error from server (NotFound): persistentvolumeclaims "audit-data" not found
```

That is the whole fault in three lines. The volume is reserved for a claim
that does not exist, and `Released` is the phase that says so.

A `PersistentVolume` moves between phases on its own in one direction only:

| Phase | Means | How it is left |
|---|---|---|
| `Available` | free, `claimRef` empty | a claim binds to it |
| `Bound` | `claimRef` names a live claim | that claim is deleted |
| `Released` | `claimRef` names a claim that is gone | **only by a human** |
| `Failed` | the reclaim policy's cleanup failed | only by a human |

`persistentVolumeReclaimPolicy` decides what happens at the moment the claim
goes away. `Delete` takes the volume object and the storage behind it.
`Retain` — this volume — keeps both and parks the volume in `Released`,
holding the reservation so that nothing else can be given data that is not
its own. It is a deliberate dead end: the operator who knows what the data is
decides what happens next.

## Why recreating the claim does nothing

The reservation is not by name. `claimRef` carries the claim's `uid`, and a
uid is issued by the API server when an object is created and never reused:

```bash
k -n norma apply -f claim.yaml          # a claim called audit-data
k -n norma get pvc audit-data -o jsonpath='{.metadata.uid}{"\n"}'
# 0b48d2b7-...        <- a different uid to the one in claimRef
k -n norma get pvc audit-data
# NAME         STATUS    VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   AGE
# audit-data   Pending                                      q24-audit      5s
```

Same name, different object, so the binder does not match them — and because
nothing provisions on class `q24-audit`, the claim has nowhere else to go
either. It waits.

## Clear the reservation

```bash
k patch pv q24-audit-pv --type=merge -p '{"spec":{"claimRef": null}}'
# persistentvolume/q24-audit-pv patched
```

`null` is how a merge patch deletes a field; `{}` would leave an empty object
behind, which is not the same thing. `kubectl edit pv q24-audit-pv` and
deleting the `claimRef:` block does the same job by hand.

```bash
k get pv q24-audit-pv -o jsonpath='{.status.phase}{"\n"}'
# Available
```

If the claim was already there, it binds within a second or two of the volume
becoming `Available` and no further step is needed.

## The claim

```bash
k -n norma apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: audit-data
  namespace: norma
spec:
  storageClassName: q24-audit
  volumeName: q24-audit-pv
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
EOF
```

Three things have to line up for a static bind, and `spec.volumeName` is the
fourth that makes it certain:

- **class** — `q24-audit`. Leave `storageClassName` out and the claim is
  served by the cluster's *default* class instead, which provisions a brand
  new empty volume: a claim that binds perfectly happily and gives you none
  of the data.
- **capacity** — the request may not exceed the volume's `1Gi`.
- **access mode** — `ReadWriteOnce`, which is what the volume offers.
- **`volumeName`** — names the volume outright. Optional here, because
  `q24-audit-pv` is the only volume on that class, and worth writing anyway
  when the volume is one you must not miss.

```bash
k -n norma get pvc audit-data -o jsonpath='{.status.phase} {.spec.volumeName}{"\n"}'
# Bound q24-audit-pv
```

## Remount it

The mount path is already right; what is wrong is what stands behind it. Only
the volume entry changes — the container's `volumeMounts` entry, which refers
to the volume by its Pod-local name `audit`, stays exactly as it is:

```bash
k -n norma patch deploy audit-viewer --type=merge -p '{
  "spec": {"template": {"spec": {
    "volumes": [{"name": "audit",
                 "persistentVolumeClaim": {"claimName": "audit-data"}}]
  }}}
}'
k -n norma rollout status deploy/audit-viewer
```

A merge patch replaces a list outright, which is what is wanted here: the
`emptyDir` goes and the claim takes its place under the same volume name.
`k -n norma edit deploy audit-viewer` and swapping those two lines is the
same edit.

```bash
k -n norma exec deploy/audit-viewer -- cat /srv/audit/audit.log
# audit trail - norma settlement service (decommissioned)
# period: 2026-Q1
# entries: 30717
# seal: q24-8b31fd

k -n norma logs deploy/audit-viewer --tail=1
# audit-viewer: serving 4 lines from /srv/audit/audit.log
```

## Where the Pod went, and why it had no choice

```bash
k -n norma get pod -l app=audit-viewer -o jsonpath='{.items[*].spec.nodeName}{"\n"}'
# sim-worker
```

`q24-audit-pv` is a `local` volume: a directory on one node's disk, declared
with `spec.nodeAffinity` naming that node. Node affinity on a volume is not
advice to the scheduler, it is a constraint — once the Pod's claim is bound
to this volume, `sim-worker` is the only node the Pod can be placed on. That
is the whole difference between a `local` volume and a bare `hostPath`: a
`hostPath` Pod scheduled onto a second node silently gets that node's empty
directory instead, and a `local` PersistentVolume without node affinity is
rejected by the API server outright.

## Why not just delete the volume and make a new one

The documentation is worth reading closely here, because at a glance it says
to do exactly that. Under **Reclaiming → Retain**, the manual reclaim
procedure is: delete the PersistentVolume, clean up the data on the storage
asset, delete the asset — and, if you want to reuse the same storage,
create a new PersistentVolume over it. That procedure is about *recycling
the asset*: the volume's contents are finished with, and what is wanted is
the underlying disk back in the pool. It is the right answer to a different
question.

This task is the other one — the contents are the point, the volume object
is a thing the organisation tracks, and both have to survive. The section to
read for it is **Reserving a PersistentVolume** on the same page: `claimRef`
is the reservation, a volume carrying one is offered to nobody else, and
that is as true of a stale reservation as of a deliberate one. Removing it
is the in-place counterpart of the reclaim procedure, and it is the whole of
this task.

It matters because deleting looks like it works. `Retain` means deleting the
PersistentVolume object removes only the object — the directory on
`sim-worker` is untouched — so a new volume pointed at the same path, with
the same name, comes up `Available`, binds, and serves the same bytes. The
trail reads back identically.

What is gone is the object. Its `uid` was the volume's identity everywhere
outside the cluster: in the storage team's inventory record
(`kubectl -n norma get cm q24-inventory -o yaml`), in the change ticket, in
whatever else refers to that volume by more than a name. That is why the task
ruled it out, and it is why the audit compares the live object's `uid` with
the recorded one rather than looking at the data — the data cannot tell the
two apart, and the record can.

The habit is worth more than the rule. `Retain` exists so that a volume
holding data nobody can reproduce is never removed by accident, and the way
to bring one back into service is to clear the stale reservation on the
object you already have. Deleting and recreating it works right up until the
day the path in the new manifest is a character out and the volume comes back
`Available` over an empty directory — with the original object, and the only
copy of where the data really was, already gone.
