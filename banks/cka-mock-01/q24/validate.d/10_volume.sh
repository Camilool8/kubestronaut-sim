#!/usr/bin/env bash
# points: 3
# desc: PersistentVolume q24-audit-pv is still the recorded object, still Retain, and Bound to the live claim norma/audit-data
# expected: none — the two scored criteria read live outcomes rather than a
#           document the candidate authored: whether the volume's phase
#           reached Bound again, and whether its claimRef names the live
#           claim by uid, a relationship between two API-assigned identifiers
#           never chosen by the candidate. The Retain-policy gate above them
#           guards the seeded field rather than scoring a criterion, and it
#           already prints the volume's own reclaimPolicy in its message.
set -uo pipefail
. /banks/_lib/checks.sh

NS=norma
PV=q24-audit-pv
CLAIM=audit-data
REC=q24-inventory

rec=$(kubectl -n "$NS" get cm "$REC" -o json 2>/dev/null)
want_uid=$(printf '%s' "${rec:-null}" | jq -r '.data.volumeUid // ""' 2>/dev/null)
want_created=$(printf '%s' "${rec:-null}" | jq -r '.data.provisioned // "<unrecorded>"' 2>/dev/null)
want_claim_uid=$(printf '%s' "${rec:-null}" | jq -r '.data.claimUid // "<unrecorded>"' 2>/dev/null)

pv=$(kubectl get pv "$PV" -o json 2>/dev/null)
name=$(printf '%s' "${pv:-null}" | jq -r '.metadata.name // ""' 2>/dev/null)
uid=$(printf '%s' "${pv:-null}" | jq -r '.metadata.uid // ""' 2>/dev/null)
created=$(printf '%s' "${pv:-null}" | jq -r '.metadata.creationTimestamp // "<none>"' 2>/dev/null)
phase=$(printf '%s' "${pv:-null}" | jq -r '.status.phase // "<none>"' 2>/dev/null)
policy=$(printf '%s' "${pv:-null}" | jq -r '.spec.persistentVolumeReclaimPolicy // "<none>"' 2>/dev/null)
ref=$(printf '%s' "${pv:-null}" | jq -r '
  if (.spec.claimRef | type) == "object"
  then ((.spec.claimRef.namespace // "?") + "/" + (.spec.claimRef.name // "?"))
  else "<none>" end' 2>/dev/null)
ref_uid=$(printf '%s' "${pv:-null}" | jq -r '.spec.claimRef.uid // ""' 2>/dev/null)

live_claim_uid=$(kubectl -n "$NS" get pvc "$CLAIM" -o jsonpath='{.metadata.uid}' 2>/dev/null)

evidence() {
  show_actual text "$(printf '%s\n' \
    "PersistentVolume $PV" \
    "  phase:       $phase" \
    "  policy:      $policy" \
    "  uid:         ${uid:-<no such volume>}" \
    "  created:     $created" \
    "  claimRef:    $ref  uid=${ref_uid:-<none>}" \
    "inventory record $NS/$REC" \
    "  volumeUid:   ${want_uid:-<unrecorded>}" \
    "  provisioned: $want_created" \
    "  claimUid:    $want_claim_uid  (the claim that was deleted)" \
    "PersistentVolumeClaim $NS/$CLAIM" \
    "  uid:         ${live_claim_uid:-<no such claim>}")"
  show_why "$1"
}

[ -n "$want_uid" ] || {
  echo "the provisioning record ConfigMap $REC is missing or empty in Namespace $NS"
  show_actual text "$(kubectl -n "$NS" get cm 2>/dev/null)"
  show_why "ConfigMap $REC is the storage team's record of $PV, written when the volume was provisioned, and the task said to leave it alone. It holds the volume's uid, which is the only thing that can tell the rescued volume apart from a replacement built over the same directory — the name and the data cannot, because both come back identical. Without the record there is nothing to compare the live volume against, so this check has nothing to grade."
  exit 1
}

[ -n "$name" ] || {
  echo "PersistentVolume $PV does not exist"
  show_actual text "$(kubectl get pv 2>/dev/null)"
  show_why "The record says $PV was provisioned at $want_created with uid $want_uid, and the pane above is what the cluster holds now. A Released volume is rescued by clearing the reservation on it, not by removing it: deleting the object under a Retain policy leaves the data on the node untouched, which is exactly why deleting looks like it worked — a fresh volume over the same directory serves the same bytes. The object is what was asked for, and it is gone."
  exit 1
}

[ "$uid" = "$want_uid" ] || {
  echo "PersistentVolume $PV is not the volume that was provisioned: uid $uid, the record says $want_uid"
  evidence "The volume was deleted and a new one was created under the same name. That is the one action this task ruled out, and it is graded here because nothing else can see it: with a Retain policy the directory on the node outlives the object, so a replacement pointed at the same path comes up holding the same audit trail, under the same name, and reads back identically. The candidate who rescued the original and the one who rebuilt it look the same in every field but this one — a uid is issued by the API server on create and cannot be chosen or restored, and $created is when this object was created. The rescue is a patch to the existing object: clearing spec.claimRef releases the reservation the deleted claim left behind. Note that kubectl replace --force and delete-then-apply are both deletions."
  exit 1
}

[ "$policy" = Retain ] || {
  echo "persistentVolumeReclaimPolicy on $PV is '$policy', want Retain"
  evidence "Retain is why this data still exists and the task said to leave it that way. The policy decides what happens at the moment the claim is deleted: Retain keeps the volume and its contents and parks the volume in Released; Delete removes the volume object and the storage behind it. Changing it to Delete does make the volume rebind — nothing about the policy is what was blocking it — but it arms the next deletion of the claim to destroy an audit trail that cannot be reproduced."
  exit 1
}

bound_to_live_claim() {
  [ -n "$live_claim_uid" ] && [ "$ref_uid" = "$live_claim_uid" ] && [ "$ref" = "$NS/$CLAIM" ]
}

crit 2 "the volume is Bound again" \
  "PersistentVolume $PV is '$phase', want Bound" \
  "Released means the volume is still reserved for a claim that no longer exists, and it is the one phase a volume never leaves on its own: the binder skips any volume whose spec.claimRef is set, whatever a new claim asks for, and Retain means nothing ever clears it automatically. So a claim written against this volume waits forever, and no amount of matching class, capacity or access mode changes that. Clearing spec.claimRef is what returns it to Available, and a merge patch removes a field with null — an empty object leaves the field in place." \
  -- [ "$phase" = Bound ]

crit 1 "it is bound to the live claim $NS/$CLAIM" \
  "claimRef on $PV names $ref with uid=${ref_uid:-<none>}; the live claim $NS/$CLAIM has uid ${live_claim_uid:-<no such claim>}" \
  "A reservation pairs a volume with one specific claim by uid, not by name, which is the whole reason recreating a claim called $CLAIM did not revive it: the API server issues a new uid for every object created, so the new claim is a stranger to the reference the old one left behind. This criterion reads that pairing from the volume's side — claimRef has to name $NS/$CLAIM AND carry the uid the claim actually has now. A uid here that matches nothing live is the stale reservation, still in place. A different name means the volume was given to some other claim, and the task pinned this one." \
  -- bound_to_live_claim

crit_all_passed || evidence "$(crit_why)"
report "$PV is bound to $NS/$CLAIM"
