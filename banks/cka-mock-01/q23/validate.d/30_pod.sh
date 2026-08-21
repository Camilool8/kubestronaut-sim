#!/usr/bin/env bash
# points: 2
# desc: Pod report-reader mounts claim report-data at /data and reads the report staged on the node
# expected: mount.json json
set -uo pipefail
. /banks/_lib/checks.sh

NS=mensa
POD=report-reader
PVC=report-data
MOUNT=/data
FILE=report.txt
TOKEN=q23-9f3c1a

pod=$(kubectl -n "$NS" get pod "$POD" -o json 2>/dev/null | jq '{
  name: (.metadata.name // null),
  phase: (.status.phase // null),
  node: (.spec.nodeName // null),
  claims: [ .spec.volumes[]? | select((.persistentVolumeClaim | type) == "object")
            | {volume: .name, claim: .persistentVolumeClaim.claimName} ],
  otherVolumes: [ .spec.volumes[]? | select((.persistentVolumeClaim | type) != "object") | .name ],
  mounts: [ .spec.containers[]? | {container: .name,
            mountedAt: [ .volumeMounts[]? | {volume: .name, mountPath: .mountPath} ]} ]}' 2>/dev/null)

name=$(printf '%s' "${pod:-null}" | jq -r '.name // ""' 2>/dev/null)

[ -n "$name" ] || {
  echo "no Pod named $POD in Namespace $NS"
  show_actual text "$(kubectl -n "$NS" get pod 2>/dev/null)"
  show_why "This check reads the Pod called $POD in Namespace $NS, and the pane above lists the Pods that Namespace holds. The Pod is not decoration on this task: on a WaitForFirstConsumer class the claim is not matched to a volume until a Pod that uses it is scheduled, so with nothing consuming $PVC the claim sits Pending forever and no part of the chain is proven. Create it in $NS, mounting the claim at $MOUNT."
  exit 1
}

phase=$(printf '%s' "${pod:-null}" | jq -r '.phase // ""' 2>/dev/null)

vol=$(printf '%s' "${pod:-null}" | jq -r --arg c "$PVC" \
  'first(.claims[]? | select(.claim == $c) | .volume) // ""' 2>/dev/null)
at=$(printf '%s' "${pod:-null}" | jq -r --arg v "$vol" --arg mp "$MOUNT" '
  if $v != "" and any(.mounts[]?.mountedAt[]?; .volume == $v and .mountPath == $mp)
  then "yes" else "no" end' 2>/dev/null)

cphase=$(kubectl -n "$NS" get pvc "$PVC" -o jsonpath='{.status.phase}' 2>/dev/null)

# Read once, and bounded twice over: kubectl's own deadline for the API call,
# and an outer one because an exec holds a stream open rather than answering a
# request. A check has 30 seconds in total and a check that overruns is scored
# failed, which would take points off a correct answer.
out=''
if [ "$phase" = Running ]; then
  out=$(timeout 12 kubectl -n "$NS" --request-timeout=10s exec "$POD" -- \
    cat "$MOUNT/$FILE" 2>/dev/null | tr -d '\r')
fi

# Only the mount shape — the Pod's own volumes and volumeMounts — gets a
# generated document. Whether the staged report actually reads back through
# it is a live outcome, and its verdict is already carried by that
# criterion's own message below; a second pane here would collide with this
# one in the UI, which shows one actual/expected pair per check, not per
# criterion.
snapshot() {
  printf '%s' "${pod:-null}" | jq -S '
    (.claims // []) as $claims
    | ($claims | map(.volume)) as $claimVolNames
    | {
        claims: $claims,
        mounts: [ (.mounts // [])[] | {
            container: .container,
            mountedAt: [ (.mountedAt // [])[] | select(.volume as $v | $claimVolNames | index($v)) ]
          } | select(.mountedAt | length > 0) ]
      }' 2>/dev/null
}

evidence() {
  show_pair json mount.json
  show_why "$1"
}

crit 1 "claim $PVC is mounted at $MOUNT" \
  "no container mounts a volume backed by claim $PVC at $MOUNT" \
  "Two things have to line up inside the Pod, and the pane above shows both. spec.volumes needs an entry whose persistentVolumeClaim.claimName is $PVC — that is what attaches the claim to this Pod and, on a WaitForFirstConsumer class, what triggers the binding at all. Then a container needs a volumeMount whose name matches THAT volume's name and whose mountPath is $MOUNT — the volume name is a label local to the Pod and has nothing to do with the claim's name, so a mount naming the claim instead of the volume is the common slip. An emptyDir or a hostPath at $MOUNT would put a directory there too, which is why this is graded on where the directory comes from rather than on whether one exists." \
  -- [ "$at" = yes ]

reads_report() { case "$out" in *"$TOKEN"*) return 0 ;; esac; return 1; }

case ${phase:-} in
  Running) why="$POD is Running but $MOUNT/$FILE read back as '${out:-<nothing>}'" ;;
  '')      why="$POD has no phase yet, so nothing can be read from $MOUNT" ;;
  *)       why="$POD is $phase (claim $PVC is ${cphase:-<no such claim>}), so nothing can be read from $MOUNT" ;;
esac

crit 1 "the staged report is readable at $MOUNT/$FILE" \
  "$why" \
  "This is the behavioural half: not what the manifests say, but whether the directory staged on sim-worker actually reached the container. The three ways it comes out short read differently in the panes above. A Pod that is Pending has not been scheduled — with the claim also Pending that is the normal state of an unfinished chain, and the events on the Pod name what is missing; with the claim Bound it is usually a Pod that cannot go where the volume is. A Pod stuck in ContainerCreating means the kubelet could not mount: a local volume whose spec.local.path does not exist on that node fails there, and $MOUNT/$FILE is staged under one path and one path only. A Pod that is Running while the file reads back empty means something else is mounted at $MOUNT — an emptyDir, or a volume backed by a different claim — so the container sees a directory that was never the node's. 'kubectl -n $NS describe pod $POD' names which of the three it is." \
  -- reads_report

crit_all_passed || evidence "$(crit_why)"
report "$POD reads the staged report through claim $PVC"
