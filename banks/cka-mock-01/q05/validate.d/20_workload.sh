#!/usr/bin/env bash
# points: 5
# desc: orbit-planner's three Pods were placed on the aux-sched node by the cluster and are running
# expected: none — both criteria are scheduling outcomes measured at a moment
#           (how many Pods now carry a nodeName, how many are Running and
#           Ready), not a document the candidate authored; the Deployment
#           fields that matter here (replicas, nodeName) are graded as
#           do-no-harm gates above, not scored criteria. The messages already
#           name the counts seen.
set -uo pipefail
. /banks/_lib/checks.sh

KCFG=/home/candidate/.kube/aux-sched
CLUSTER=aux-sched
NS=default
DEP=orbit-planner
REPLICAS=3

kaux() {
  kubectl --kubeconfig "$KCFG" --request-timeout=5s "$@"
}

count_or_zero() {
  case ${1:-} in
    ''|*[!0-9]*) printf '0' ;;
    *) printf '%s' "$1" ;;
  esac
}

dep=$(kaux -n "$NS" get deploy "$DEP" -o json 2>/dev/null | jq -c '
  {name: (.metadata.name // null),
   replicas: (.spec.replicas // 1),
   selector: (.spec.selector.matchLabels // {}),
   nodeName: (.spec.template.spec.nodeName // ""),
   nodeSelector: (.spec.template.spec.nodeSelector // {}),
   ready: (.status.readyReplicas // 0)}' 2>/dev/null)

pods=''

evidence() {
  show_actual json "$(printf '{"Deployment %s/%s": %s, "its Pods": %s}' \
    "$NS" "$DEP" "${dep:-null}" "${pods:-null}")"
  show_why "$1"
}

# Nothing at all came back, so the second cluster was not reached — a different
# thing from a cluster that answered and has no Deployment. Concluding anything
# about the placement from a read that never happened would be inventing it.
[ -n "$dep" ] || {
  echo "the $CLUSTER cluster did not answer a read of Namespace $NS"
  show_actual text "$(kaux get nodes 2>&1 | head -20)"
  show_why "Everything in this check is read from the $CLUSTER cluster through the kubeconfig at $KCFG, and that request produced no answer at all — the pane above is what kubectl said when it was asked for that cluster's nodes. The placement is not being judged here; the cluster could not be read. Check that $KCFG still resolves to a file and that the cluster still exists. This is a separate cluster from the one the default kubeconfig points at, and a read aimed at the main cluster will never find this Deployment."
  exit 1
}

name=$(printf '%s' "${dep:-null}" | jq -r '.name // ""' 2>/dev/null)

# Do-no-harm, so gates rather than criteria: each of these is true of the
# untouched seed, and a criterion the seed already satisfies is a point awarded
# for no work. They are also the three short wrong paths through this question —
# delete the workload, scale it away, or place the Pods yourself — every one of
# which empties the Pending column without a scheduler ever running.
[ -n "$name" ] || {
  echo "Deployment $DEP is gone from Namespace $NS on $CLUSTER"
  show_actual text "$(kaux -n "$NS" get deploy 2>&1 | head -20)"
  show_why "The task is to make the cluster place this workload, and deleting it is not a way to stop the Pods being Pending — it takes the thing being scheduled out of the cluster altogether. Re-create it, or let a reset re-seed it: banks/${BANK:-cka-mock-01}/q05/setup.sh holds the manifest it was seeded from. Then repair the control plane and let the cluster place the Pods itself."
  exit 1
}

replicas=$(count_or_zero "$(printf '%s' "${dep:-null}" | jq -r '.replicas' 2>/dev/null)")
[ "$replicas" -eq "$REPLICAS" ] || {
  echo "$DEP is set to $replicas replica(s), and the question asks for it to be left at $REPLICAS"
  evidence "Scaling the Deployment down would clear the Pending Pods without anything having been repaired, which is why the replica count is checked before the placement is. 'kubectl --kubeconfig $KCFG -n $NS scale deploy/$DEP --replicas=$REPLICAS' puts it back. Nothing about repairing the control plane changes this number."
  exit 1
}

pin=$(printf '%s' "${dep:-null}" | jq -r '.nodeName // ""' 2>/dev/null)
[ -z "$pin" ] || {
  echo "$DEP pins its Pods to a node itself: spec.template.spec.nodeName='$pin'"
  evidence "A Pod that names its own node is never handed to a scheduler at all — the kubelet on that node picks it up directly — so setting nodeName on the Pod template starts the Pods while leaving the cluster exactly as broken as it was. The question asks for the opposite: the cluster has to place them. Take the field back out of spec.template.spec — 'kubectl --kubeconfig $KCFG -n $NS edit deploy $DEP' is the quickest way — and repair the control plane instead."
  exit 1
}

sel=$(printf '%s' "${dep:-null}" \
  | jq -r '[ (.selector // {}) | to_entries[] | "\(.key)=\(.value)" ] | join(",")' 2>/dev/null)

# The Deployment's own selector rather than a hard-coded label: an answer that
# re-created the workload is still the same workload, and its Pods are whatever
# its selector says they are. Pod names are shown but never graded — a
# ReplicaSet generates them, and they change under every restart.
pods=$(kaux -n "$NS" get pods -l "${sel:-app=$DEP}" -o json 2>/dev/null | jq -c '
  [ .items[]?
    | select(.metadata.deletionTimestamp == null)
    | {pod: .metadata.name,
       node: (.spec.nodeName // ""),
       phase: .status.phase,
       ready: ([ .status.conditions[]? | select(.type == "Ready") | .status ] | join("")),
       waiting: [ .status.containerStatuses[]? | .state.waiting.reason // empty ]} ]' 2>/dev/null)

placed=$(count_or_zero "$(printf '%s' "${pods:-[]}" \
  | jq '[ .[]? | select(.node != "") ] | length' 2>/dev/null)")
alive=$(count_or_zero "$(printf '%s' "${pods:-[]}" \
  | jq '[ .[]? | select(.phase == "Running" and .ready == "True") ] | length' 2>/dev/null)")
total=$(count_or_zero "$(printf '%s' "${pods:-[]}" | jq 'length' 2>/dev/null)")

crit 3 "all $REPLICAS Pods have been given a node" \
  "$placed of $total $DEP Pod(s) have a node assigned, want $REPLICAS" \
  "A Pod is created with spec.nodeName empty and stays Pending until something writes a node into it. That something is kube-scheduler, and it is the only part of the control plane that does it — no controller, no kubelet and no amount of waiting will place a Pod while the scheduler is down. So this criterion is really the first one restated as a result: repair the scheduler and the three Pods are bound within a second of it becoming ready, with no action needed on the Deployment. 'kubectl --kubeconfig $KCFG -n $NS get pods -o wide' shows the NODE column filling in." \
  -- [ "$placed" -ge "$REPLICAS" ]

crit 2 "all $REPLICAS Pods are Running and Ready" \
  "$alive of $total $DEP Pod(s) are Running and Ready, want $REPLICAS" \
  "Placement and startup are two separate steps, and this is the second one: once a Pod has a node, that node's kubelet pulls the image and starts the container. A Pod stuck between the two — bound to the node but not Ready — is no longer a scheduling fault, so read its container status: 'kubectl --kubeconfig $KCFG -n $NS describe pod <name>' names the reason, and the image this workload uses is already present on the node, so it should not be waiting on a pull." \
  -- [ "$alive" -ge "$REPLICAS" ]

crit_all_passed || evidence "$(crit_why)"
report "$CLUSTER placed and started all $REPLICAS $DEP Pods"
