#!/usr/bin/env bash
# points: 4
# desc: nothing outside a DaemonSet is left on sim-worker4 and telemetry-collector's Pods survived the eviction
set -uo pipefail
. /banks/_lib/checks.sh

NS=aquila
NODE=sim-worker4
DEP=telemetry-collector
SEEDED_REPLICAS=2

# jq answers nothing at all when kubectl handed it nothing at all, and a count
# read into arithmetic has to be a number either way.
count_or_zero() {
  case ${1:-} in
    ''|*[!0-9]*) printf '0' ;;
    *) printf '%s' "$1" ;;
  esac
}

# One small read: the field selector asks the API for the Pods bound to this
# node instead of every Pod in the cluster. Pod names are shown but never
# graded — a ReplicaSet generates them and they change under every eviction.
onnode=$(kubectl get pods -A --field-selector "spec.nodeName=$NODE" -o json 2>/dev/null \
  | jq '[ .items[]?
          | select(.metadata.deletionTimestamp == null)
          | {namespace: .metadata.namespace,
             pod: .metadata.name,
             owners: [ .metadata.ownerReferences[]?.kind ],
             mirror: (.metadata.annotations["kubernetes.io/config.mirror"] != null),
             phase: .status.phase} ]' 2>/dev/null)

# What emptying a node is responsible for moving: everything that is not a
# DaemonSet Pod and not a static Pod mirrored from a node's own disk. Those two
# stay on a drained node by design — a DaemonSet would immediately place its Pod
# back, and nothing the API does can remove a Pod a kubelet reads off local
# files — which is why they are excluded here as well as by the drain itself.
staying=$(printf '%s' "${onnode:-[]}" | jq -c '
  [ .[]? | select(.mirror | not)
         | select( any(.owners[]?; . == "DaemonSet") | not ) ]' 2>/dev/null)

dep=$(kubectl -n "$NS" get deploy "$DEP" -o json 2>/dev/null \
  | jq '{name: (.metadata.name // null),
         replicas: (.spec.replicas // 1),
         selector: (.spec.selector.matchLabels // {}),
         nodeSelector: (.spec.template.spec.nodeSelector // {})}' 2>/dev/null)

mine=''

evidence() {
  show_actual json "$(printf '{"Pods on %s": %s, "not managed by a DaemonSet": %s, "%s": %s, "%s Pods": %s}' \
    "$NODE" "${onnode:-null}" "${staying:-null}" "$DEP" "${dep:-null}" "$DEP" "${mine:-null}")"
  show_why "$1"
}

# Vacuous-pass guard: with the Node object gone, "nothing is left running on it"
# is true of a node that is still running everything it had.
node=$(kubectl get node "$NODE" -o jsonpath='{.metadata.name}' 2>/dev/null)
[ -n "$node" ] || {
  echo "no node named $NODE in this cluster"
  show_actual text "$(kubectl get nodes 2>/dev/null)"
  show_why "Everything graded here is read from the Pods bound to the node called $NODE, and the pane above lists the nodes the API knows about. Deleting the Node object empties the record, not the machine: its kubelet keeps the containers running and re-registers moments later, and while the object is missing nothing about the maintenance can be measured. If instead the name was simply wrong, note that cka-worker4 is a login alias in a client config file — the API server only answers to the names 'kubectl get nodes' prints."
  exit 1
}

# "Nothing is left on the node" must never be concluded from a read that did not
# happen. A listing that came back empty-handed — no JSON at all — is an API the
# check could not reach, and awarding the emptiness criterion for it would hand
# out points for a broken cluster. A node that really is drained still answers
# with its DaemonSet Pods, so a genuine empty array is a different thing and
# still scores.
[ -n "$onnode" ] || {
  echo "could not list the Pods bound to $NODE"
  show_actual text "$(kubectl get pods -A --field-selector "spec.nodeName=$NODE" 2>&1 | head -20)"
  show_why "This criterion is decided by asking the API which Pods are bound to $NODE, and that request did not come back with an answer at all — the pane above is what kubectl said when it was asked again. Nothing about the drain is being judged here; the cluster could not be read. If the API server or this instance's credentials were disturbed by other work, that is the thing to fix first."
  exit 1
}

name=$(printf '%s' "${dep:-null}" | jq -r '.name // ""' 2>/dev/null)

# Do-no-harm, so a gate rather than a criterion: all three of these are true of
# the untouched seed, and scoring something the seed already satisfies is a point
# awarded for no work. The harm is the shortest wrong path through this question
# — deleting the workload, or scaling it to zero, empties the node without
# draining anything, and re-homing it moves the Pods somewhere the maintenance
# was never arranged for. Emptying a node is a thing you do TO the node; the
# workload above it is left to the controller that owns it.
[ -n "$name" ] || {
  echo "Deployment $DEP is gone from Namespace $NS"
  show_actual text "$(kubectl -n "$NS" get deploy 2>/dev/null)"
  show_why "The task is to take $NODE out of service with $DEP intact, and deleting the Deployment is the largest possible modification to it. It also gets the node empty for the wrong reason: a drain EVICTS Pods, which is a request the controller above them answers by creating replacements, while a delete of the Deployment takes the workload out of the cluster altogether. Re-create it — banks/${BANK:-cka-mock-01}/q06/setup.sh holds the manifest it was seeded from, and a reset re-seeds it — then empty the node without touching it."
  exit 1
}

replicas=$(count_or_zero "$(printf '%s' "${dep:-null}" | jq -r '.replicas' 2>/dev/null)")
[ "$replicas" -eq "$SEEDED_REPLICAS" ] || {
  echo "$DEP is set to $replicas replica(s), and the question asks for it to be left at $SEEDED_REPLICAS"
  evidence "Scaling the Deployment to zero would empty the node without evicting anything, which is why the replica count is checked before the emptiness is: the two Pods have to be moved off $NODE, not removed from the cluster. 'kubectl -n $NS scale deploy/$DEP --replicas=$SEEDED_REPLICAS' puts it back. A drain never changes this number — it deletes Pods through the eviction API and the ReplicaSet immediately asks for replacements."
  exit 1
}

pin=$(printf '%s' "${dep:-null}" | jq -r '.nodeSelector["kubernetes.io/hostname"] // ""' 2>/dev/null)
[ "$pin" = "$NODE" ] || {
  echo "$DEP no longer pins its Pods to $NODE (kubernetes.io/hostname nodeSelector: '${pin:-<none>}')"
  evidence "The question asks for the Deployment to be left as it is, and this is the field that was changed. Removing or re-aiming the hostname pin lets the replacement Pods schedule onto another worker, which does empty $NODE — but by moving the application to hardware nobody planned for rather than by taking the node out of service, and it hides whether the node was ever drained at all. Pods left Pending while their node is down is the correct outcome here, not a fault to be worked around. Put the nodeSelector back: kubernetes.io/hostname: $NODE, on spec.template.spec."
  exit 1
}

left=$(count_or_zero "$(printf '%s' "${staying:-[]}" | jq -r 'length' 2>/dev/null)")
left_names=$(printf '%s' "${staying:-[]}" \
  | jq -r '[ .[]? | "\(.namespace)/\(.pod)" ] | join(", ")' 2>/dev/null)

crit 3 "no Pod outside a DaemonSet is left on $NODE" \
  "$left Pod(s) are still running on $NODE: ${left_names:-none}" \
  "This is the half that actually empties the node, and cordoning does not do it: marking a node unschedulable only decides NEW placements and evicts nothing, so every Pod that was running stays running. 'kubectl drain $NODE' is cordon plus eviction, and it stops twice to make you say what you mean about the Pods it will not move on its own. DaemonSet Pods are one of them — they would be recreated on the same node the moment they were deleted, so drain refuses until told '--ignore-daemonsets', and they are excluded here for the same reason. A Pod with an emptyDir is the other: its scratch data is on this node's disk and is destroyed with the Pod, so drain will not make that decision for you without '--delete-emptydir-data'. Read the error it prints — it names each Pod it stopped on and the flag that covers it." \
  -- [ "$left" -eq 0 ]

sel=$(printf '%s' "${dep:-null}" \
  | jq -r '[ (.selector // {}) | to_entries[] | "\(.key)=\(.value)" ] | join(",")' 2>/dev/null)

# The Deployment's own selector rather than a hard-coded label: an answer that
# re-created the workload is still the same workload, and its Pods are whatever
# its selector says they are.
mine=$(kubectl -n "$NS" get pod -l "${sel:-app=$DEP}" -o json 2>/dev/null | jq -c '
  [ .items[]? | select(.metadata.deletionTimestamp == null)
              | {node: (.spec.nodeName // ""), phase: .status.phase} ]' 2>/dev/null)

alive=$(count_or_zero "$(printf '%s' "${mine:-[]}" | jq -r 'length' 2>/dev/null)")
still_here=$(count_or_zero "$(printf '%s' "${mine:-[]}" \
  | jq -r --arg n "$NODE" '[ .[]? | select(.node == $n) ] | length' 2>/dev/null)")

survived() { [ "$alive" -ge "$SEEDED_REPLICAS" ] && [ "$still_here" -eq 0 ]; }

crit 1 "$DEP still has its $SEEDED_REPLICAS Pods, none of them on $NODE" \
  "$DEP has $alive Pod(s), $still_here of them still on $NODE" \
  "An eviction is a polite delete: it goes through the eviction API, the ReplicaSet sees a Pod short and asks for a replacement immediately, and the replacement is placed under whatever rules apply now. Here those rules leave it nowhere to go — the only node it may run on has just been closed — so the two Pods sit Pending, and that is what this criterion expects to find. A count short of $SEEDED_REPLICAS means the Pods were taken out of the cluster rather than off the node; Pods still counted on $NODE mean the eviction has not happened yet, or stopped at the first Pod it was not allowed to move." \
  -- survived

crit_all_passed || evidence "$(crit_why)"
report "$NODE is empty and $DEP is waiting for it"
