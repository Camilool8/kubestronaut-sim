#!/usr/bin/env bash
# points: 2
# desc: PersistentVolumeClaim archive-data is Bound to a volume dynamically provisioned by q25-local-retain, and that volume retains its data
set -uo pipefail
. /banks/_lib/checks.sh

NS=crater
SC=q25-local-retain
PVC=archive-data

pvc=$(kubectl -n "$NS" get pvc "$PVC" -o json 2>/dev/null)

[ -n "$pvc" ] || {
  echo "PersistentVolumeClaim $PVC not found in Namespace $NS"
  show_actual text "$(kubectl -n "$NS" get pvc 2>/dev/null)"
  show_why "The claim is the object that asks for a volume, and this question pins its name and its Namespace. The pane above is what crater actually holds. Note that a claim is not needed for the class to exist, nor the class for the claim to be created — they are separate objects, and a claim naming a class that does not exist simply waits."
  exit 1
}

phase=$(printf '%s' "$pvc" | jq -r '.status.phase // "<none>"' 2>/dev/null)
class=$(printf '%s' "$pvc" | jq -r '.spec.storageClassName // "<unset>"' 2>/dev/null)

# The name of the PersistentVolume is never graded — it is pvc-<uid>, minted by
# the provisioner, and nobody could have predicted it. It is used here only as
# the key that gets from the claim to the volume it was actually given, which is
# where the reclaim policy this question is about ends up living.
vol=$(printf '%s' "$pvc" | jq -r '.spec.volumeName // ""' 2>/dev/null)

pv=''
[ -n "$vol" ] && pv=$(kubectl get pv "$vol" -o json 2>/dev/null)
pvpolicy=$(printf '%s' "${pv:-null}" | jq -r '.spec.persistentVolumeReclaimPolicy // "<none>"' 2>/dev/null)

# Binding is asynchronous, so a claim can legitimately be Pending for a few
# seconds. This check does not wait for it — a check has 30 seconds and a
# timed-out check is scored failed — it grades the state it finds and puts the
# reason beside it. The claim's own events are what `describe` prints under
# Events, and for a Pending claim they are the whole story: no consumer
# scheduled yet, no class of that name, or a provisioner that refused.
events=$(kubectl -n "$NS" get events \
  --field-selector "involvedObject.kind=PersistentVolumeClaim,involvedObject.name=${PVC}" \
  -o json 2>/dev/null \
  | jq -r '[.items[]? | ((.reason // "?") + ": " + (.message // ""))] | unique | join("\n")' 2>/dev/null)

evidence() {
  show_actual text "$(
    kubectl -n "$NS" get pvc "$PVC" 2>/dev/null
    echo
    echo "the volume it names, if any:"
    { [ -n "$vol" ] && kubectl get pv "$vol" 2>/dev/null; } || echo "(the claim names no volume yet)"
    echo
    echo "events on the claim:"
    printf '%s\n' "${events:-none}"
    echo
    echo "the local-path provisioner this class is meant to be served by:"
    kubectl -n local-path-storage get deploy local-path-provisioner 2>/dev/null
  )"
  show_why "$1"
}

bound_on_class() {
  [ "$phase" = Bound ] && [ "$class" = "$SC" ] && [ -n "$vol" ]
}

retains() { [ "$pvpolicy" = Retain ]; }

crit 1 "the claim is Bound to a volume from $SC" \
  "PersistentVolumeClaim $PVC is '$phase' with storageClassName '$class', want Bound on $SC" \
  "Two things have to be true and only one of them is visible in the phase. The class must be named on the claim: leave storageClassName out and the claim is served by the cluster's default class instead, which binds perfectly happily and gives you a volume this question is not about. And the claim must actually have bound, which on a WaitForFirstConsumer class does not happen until a Pod that mounts it has been scheduled — so a claim created and left alone stays Pending by design, and the events pane above will say so. Pending with nothing in its events at all usually means the class it names does not exist." \
  -- bound_on_class

crit 1 "the volume it was given retains its data" \
  "the PersistentVolume bound to $PVC has persistentVolumeReclaimPolicy='$pvpolicy', want Retain" \
  "This is the criterion the StorageClass was for. A dynamically provisioned volume is stamped with its class's reclaimPolicy when it is created, and that stamp is what decides what happens on the day the claim is deleted: Delete takes the volume and the data with it, Retain leaves the volume behind holding both, moved to Released and waiting for someone to decide. Because the stamp is taken at provisioning time, the order of the work matters — a claim that bound while the class still said Delete has a volume that says Delete, and fixing the class afterwards will not change it. Deleting that claim and making a new one on the corrected class is what gets a retained volume." \
  -- retains

crit_all_passed || evidence "$(crit_why)"
report "volume provisioned and retained"
