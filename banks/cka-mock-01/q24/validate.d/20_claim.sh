#!/usr/bin/env bash
# points: 1
# desc: PersistentVolumeClaim norma/audit-data is Bound to the retained volume q24-audit-pv
set -uo pipefail
. /banks/_lib/checks.sh

NS=norma
PV=q24-audit-pv
CLAIM=audit-data
SC=q24-audit
REC=q24-inventory

# The action this task ruled out is graded in every check that rests on the
# volume, not only in the one that reads it. A replacement built over the same
# directory carries the same name and serves the same trail through the same
# claim, so a criterion that stopped at "Bound to q24-audit-pv" would score work
# the question forbade. Only a POSITIVE contradiction gates: if the record is
# missing there is nothing to contradict, and this criterion still grades its
# own subject — the missing record is 10_volume's business, not this check's.
rec_uid=$(kubectl -n "$NS" get cm "$REC" -o jsonpath='{.data.volumeUid}' 2>/dev/null)
pv_uid=$(kubectl get pv "$PV" -o jsonpath='{.metadata.uid}' 2>/dev/null)
if [ -n "$rec_uid" ] && [ -n "$pv_uid" ] && [ "$rec_uid" != "$pv_uid" ]; then
  echo "the volume named $PV is not the volume that was provisioned: uid $pv_uid, the record says $rec_uid"
  show_actual text "$(printf '%s\n' \
    "PersistentVolume $PV: uid $pv_uid" \
    "inventory record $NS/$REC: volumeUid $rec_uid" \
    "$(kubectl -n "$NS" get pvc 2>/dev/null)")"
  show_why "This claim may well be bound to a volume called $PV, but it is not the one the audit trail was provisioned on: that object was deleted and another was created under its name. Retain is what makes the substitution invisible — the directory on the node outlives the volume object, so a new volume pointed at the same path serves the same bytes to the same claim — and the uid the record was taken from is the only thing that can tell them apart. The rescue was a patch to the object that was already there: clearing spec.claimRef releases the reservation the deleted claim left behind."
  exit 1
fi

pvc=$(kubectl -n "$NS" get pvc "$CLAIM" -o json 2>/dev/null)
name=$(printf '%s' "${pvc:-null}" | jq -r '.metadata.name // ""' 2>/dev/null)
phase=$(printf '%s' "${pvc:-null}" | jq -r '.status.phase // "<none>"' 2>/dev/null)
vol=$(printf '%s' "${pvc:-null}" | jq -r '.spec.volumeName // ""' 2>/dev/null)
class=$(printf '%s' "${pvc:-null}" | jq -r '.spec.storageClassName // "<unset: the default class>"' 2>/dev/null)
req=$(printf '%s' "${pvc:-null}" | jq -r '.spec.resources.requests.storage // "<unset>"' 2>/dev/null)
modes=$(printf '%s' "${pvc:-null}" | jq -r '[.spec.accessModes[]?] | join(",")' 2>/dev/null)

# A Pending claim's own events are the whole story — no volume matched, no
# provisioner on the class, or a size or mode the volume cannot satisfy — so
# they go in the pane rather than being summarised away.
events=$(kubectl -n "$NS" get events \
  --field-selector "involvedObject.kind=PersistentVolumeClaim,involvedObject.name=${CLAIM}" \
  -o json 2>/dev/null \
  | jq -r '[.items[]? | ((.reason // "?") + ": " + (.message // ""))] | unique | join("\n")' 2>/dev/null)

[ -n "$name" ] || {
  echo "no PersistentVolumeClaim named $CLAIM in Namespace $NS"
  show_actual text "$(kubectl -n "$NS" get pvc 2>/dev/null)"
  show_why "The claim is the object that asks for a volume, and this task pins its name and its Namespace. The pane above is what $NS holds. Note that the volume cannot be handed over without one: clearing the stale reservation returns $PV to Available, and Available is a volume waiting for a claim, not a volume attached to anything."
  exit 1
}

evidence() {
  show_actual text "$(printf '%s\n' \
    "PersistentVolumeClaim $NS/$CLAIM" \
    "  phase:       $phase" \
    "  volumeName:  ${vol:-<none>}" \
    "  class:       $class" \
    "  requests:    $req  modes: ${modes:-<none>}" \
    "the retained volume:" \
    "$(kubectl get pv "$PV" 2>/dev/null)" \
    "events on the claim:" \
    "${events:-none}")"
  show_why "$1"
}

took_the_retained_volume() { [ "$phase" = Bound ] && [ "$vol" = "$PV" ]; }

crit 1 "the claim is Bound to $PV" \
  "PersistentVolumeClaim $NS/$CLAIM is '$phase' on volume '${vol:-<none>}', want Bound on $PV" \
  "Bound on its own is not the answer here — this claim has to have taken the retained volume and not some other one. Two ways it binds to the wrong thing. Leave storageClassName out and the claim is served by the cluster's default class, which provisions a brand new empty volume on demand: the claim goes Bound within seconds and the audit trail is nowhere in it. Ask for more than 1Gi, or for an access mode $PV does not offer, and it binds to nothing at all. Class $SC has no provisioner, so on that class the only volume a claim can ever be given is one that already exists and is Available — which is why the reservation on $PV has to be cleared before this can succeed, and why the events above will show the claim waiting if it has not been. spec.volumeName on the claim names the volume outright and settles it." \
  -- took_the_retained_volume

crit_all_passed || evidence "$(crit_why)"
report "$CLAIM is bound to $PV"
