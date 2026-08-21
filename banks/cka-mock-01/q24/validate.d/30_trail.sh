#!/usr/bin/env bash
# points: 3
# desc: the audit-viewer Pod mounts claim audit-data at /srv/audit and the retained trail reads back inside it
# expected: mount.json json
set -uo pipefail
. /banks/_lib/checks.sh

NS=norma
DEP=audit-viewer
CLAIM=audit-data
PV=q24-audit-pv
REC=q24-inventory
MOUNT=/srv/audit
FILE=audit.log
SEAL=q24-8b31fd

# The action this task ruled out is graded here too, and it has to be: this is
# the check a replacement volume passes most easily. Retain keeps the directory
# on the node when the volume object goes, so a new volume over the same path
# puts the same trail in front of the same Deployment, and the behavioural
# evidence alone cannot tell that apart from a rescue. Only a POSITIVE
# contradiction gates — with no record to compare against, the criteria below
# still grade what they say they grade.
rec_uid=$(kubectl -n "$NS" get cm "$REC" -o jsonpath='{.data.volumeUid}' 2>/dev/null)
pv_uid=$(kubectl get pv "$PV" -o jsonpath='{.metadata.uid}' 2>/dev/null)
if [ -n "$rec_uid" ] && [ -n "$pv_uid" ] && [ "$rec_uid" != "$pv_uid" ]; then
  echo "the volume named $PV is not the volume that was provisioned: uid $pv_uid, the record says $rec_uid"
  show_actual text "$(printf '%s\n' \
    "PersistentVolume $PV: uid $pv_uid" \
    "inventory record $NS/$REC: volumeUid $rec_uid")"
  show_why "The trail does reach the Deployment, and it is the trail — the bytes on the node were never touched, because Retain keeps the directory when the volume object is removed. What is not there any more is the volume the audit tracks: it was deleted and replaced by another object under the same name, which is what this task ruled out and the only thing the data itself cannot show. The rescue was a patch to the existing object, clearing the reservation the deleted claim left behind on it."
  exit 1
fi

dep=$(kubectl -n "$NS" get deploy "$DEP" -o json 2>/dev/null)
depname=$(printf '%s' "${dep:-null}" | jq -r '.metadata.name // ""' 2>/dev/null)

[ -n "$depname" ] || {
  echo "no Deployment named $DEP in Namespace $NS"
  show_actual text "$(kubectl -n "$NS" get deploy,pod 2>/dev/null)"
  show_why "$DEP is the workload the trail has to reach, and it was already here: the task was to change where its volume comes from, not to provide the workload. The pane above is what $NS holds now."
  exit 1
}

# The selector is read off the Deployment rather than assumed, so a candidate
# who rebuilt the workload under labels of their own is still graded on what it
# does. Pod names are never matched or reported: they are generated, they change
# on every rollout, and the newest Pod that is Running and not already going
# away is the one whose template is live.
sel=$(printf '%s' "${dep:-null}" \
  | jq -r '[(.spec.selector.matchLabels // {}) | to_entries[] | .key + "=" + .value] | join(",")' 2>/dev/null)
[ -n "$sel" ] || sel="app=$DEP"

pod=$(kubectl -n "$NS" get pod -l "$sel" -o json 2>/dev/null | jq -r '
  [.items[]? | select(.metadata.deletionTimestamp == null and .status.phase == "Running")]
  | sort_by(.metadata.creationTimestamp) | last | .metadata.name // ""' 2>/dev/null)

claim_state=$(kubectl -n "$NS" get pvc "$CLAIM" \
  -o jsonpath='{.status.phase}/{.spec.volumeName}' 2>/dev/null)

[ -n "$pod" ] || {
  echo "$DEP has no running Pod to read the trail from"
  show_actual text "$(printf '%s\n' \
    "$(kubectl -n "$NS" get pod -l "$sel" -o wide 2>/dev/null)" \
    "PersistentVolumeClaim $NS/$CLAIM: ${claim_state:-<no such claim>}" \
    "$(kubectl -n "$NS" get deploy "$DEP" 2>/dev/null)")"
  show_why "The behavioural half of this task needs a Pod that is up, and there is none. Pending usually means the claim it mounts has not bound — a Pod never starts on an unbound claim, so the volume's reservation and the claim are where to look. ContainerCreating with a FailedMount event means the kubelet could not attach it, which for a local volume is the node's directory not being where spec.local.path says it is. A Pod that will not schedule at all can also be a node problem: this volume lives on one node and its node affinity means the Pod can be placed nowhere else. 'kubectl -n $NS describe pod' names which of the three it is."
  exit 1
}

podjson=''
[ -n "$pod" ] && podjson=$(kubectl -n "$NS" get pod "$pod" -o json 2>/dev/null)

vols=$(printf '%s' "${podjson:-null}" \
  | jq -r '[.spec.volumes[]? | .name + " -> " + (del(.name) | keys | join(","))] | join("; ")' 2>/dev/null)
mounts=$(printf '%s' "${podjson:-null}" \
  | jq -r '[.spec.containers[]? | .name as $c | .volumeMounts[]? | $c + ":" + .mountPath + "=" + .name]
           | join("; ")' 2>/dev/null)

# The join is on the Pod-LOCAL volume name, which is what a volumeMount refers
# to and which has nothing to do with the claim's name. The current mount is
# bound to $m first: piped into $v it would be indexing the array of volume
# names, which is an error rather than a false, and an error here would fail a
# correct answer.
mounted=$(printf '%s' "${podjson:-null}" | jq -r --arg c "$CLAIM" --arg mp "$MOUNT" '
  [.spec.volumes[]? | select((.persistentVolumeClaim | type) == "object")
   | select(.persistentVolumeClaim.claimName == $c) | .name] as $v
  | if any(.spec.containers[]?.volumeMounts[]?;
           . as $m | $m.mountPath == $mp and (($v | index($m.name)) != null))
    then "yes" else "no" end' 2>/dev/null)

# Read once, bounded twice: kubectl's own deadline for the API call and an outer
# one, because an exec holds a stream open rather than answering a request. A
# check has 30 seconds in total and one that overruns is scored failed, which
# would take points off a correct answer. stderr is kept — "no such file" and a
# refused exec are both answers worth putting in the pane.
out=''
[ -n "$pod" ] && out=$(timeout 12 kubectl -n "$NS" --request-timeout=10s exec "$pod" -- \
  cat "$MOUNT/$FILE" 2>&1 | tr -d '\r')

# Only the mount shape — the running Pod's own volumes and volumeMounts —
# gets a generated document. Whether the retained trail actually reads back
# through it is a live outcome, and its verdict is already carried by that
# criterion's own message below; a second pane here would collide with this
# one in the UI, which shows one actual/expected pair per check, not per
# criterion.
snapshot() {
  printf '%s' "${podjson:-null}" | jq -S '{
    claims: [ .spec.volumes[]? | select((.persistentVolumeClaim|type)=="object")
              | {name, claim: .persistentVolumeClaim.claimName} ],
    mounts: [ .spec.containers[]? | {container: .name, volumeMounts: (.volumeMounts // [])} ]
  }' 2>/dev/null
}

evidence() {
  show_pair json mount.json
  show_why "$1"
}

crit 1 "the running Pod mounts claim $CLAIM at $MOUNT" \
  "no volume backed by claim $CLAIM is mounted at $MOUNT (volumes: ${vols:-none}; mounts: ${mounts:-none})" \
  "Two things have to line up inside the Pod and the pane above shows both. spec.volumes needs an entry whose persistentVolumeClaim.claimName is $CLAIM, and a container needs a volumeMount whose mountPath is $MOUNT and whose name matches THAT volume's name — the volume name is a label local to the Pod and is not the claim's name, so a mount naming the claim instead of the volume is the usual slip. This is read from the running Pod rather than from the Deployment's template, because a template that was edited after the last rollout describes a Pod that does not exist yet. The mount path was already there and already backed by scratch space: what changes is the volume entry behind it, not the volumeMount." \
  -- [ "$mounted" = yes ]

reads_trail() {
  [ "$mounted" = yes ] || return 1
  case $out in
    *"$SEAL"*) return 0 ;;
  esac
  return 1
}

case $mounted in
  yes) shortfall="the Pod mounts $CLAIM at $MOUNT, but $MOUNT/$FILE read back as '${out:-<nothing>}'" ;;
  *)   shortfall="nothing backed by claim $CLAIM is mounted at $MOUNT, so what the container finds there is not the retained trail" ;;
esac

crit 2 "the retained audit trail reads back through that mount" \
  "$shortfall" \
  "This is what the whole task was for: not what the manifests say, but whether the trail written before the service was decommissioned reached the container. It is graded through the claim's own mount, so a file typed into the scratch volume at the same path is not an answer. An empty read with the claim mounted means the volume behind it is not the retained one — a claim that fell through to the cluster's default class gets a brand new, empty volume and mounts perfectly happily. A read that fails with 'no such file' means the volume is right and the file is not where it was: $FILE sits at the root of the volume, so it appears at $MOUNT/$FILE and nowhere deeper. 'kubectl -n $NS logs deploy/$DEP' shows the container's own view of the same thing on every loop." \
  -- reads_trail

crit_all_passed || evidence "$(crit_why)"
report "the audit trail reads back through $CLAIM"
