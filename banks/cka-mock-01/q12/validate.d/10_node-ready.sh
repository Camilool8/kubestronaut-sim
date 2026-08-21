#!/usr/bin/env bash
# points: 2
# desc: every node in the aux-cni cluster reports Ready
# expected: none — this grades the node's live Ready condition, written by
#           the node lifecycle controller once the kubelet's own network
#           check clears, rather than anything the candidate authored; there
#           is no manifest for a Ready condition to be compared against.
set -uo pipefail
. /banks/_lib/checks.sh

# The aux cluster is read over its published kubeconfig, from this instance,
# like every other check in the bank. The symlink dangles when the cluster was
# never built or has been deleted, and the API can be down for reasons that are
# nobody's fault, so the request is bounded: an unreachable cluster has to fail
# with evidence inside the check's 30 s, never hang.
AUX=/home/candidate/.kube/aux-cni

nodes=$(kubectl --kubeconfig "$AUX" --request-timeout=5s get nodes -o json 2>/dev/null \
  | jq '[ .items[]?
          | {name: .metadata.name,
             ready: ([ .status.conditions[]? | select(.type == "Ready") | .status ] | join("")),
             reason: ([ .status.conditions[]? | select(.type == "Ready") | .reason ] | join("")),
             message: ([ .status.conditions[]? | select(.type == "Ready") | .message ] | join("")),
             taints: [ .spec.taints[]?
                       | .key + (if (.value // "") == "" then "" else "=" + .value end)
                       + ":" + .effect ]} ]' 2>/dev/null)

evidence() {
  show_actual json "${nodes:-null}"
  show_why "$1"
}

count=$(printf '%s' "${nodes:-[]}" | jq 'length' 2>/dev/null)
case ${count:-0} in
  ''|0)
    echo "the aux-cni cluster listed no nodes"
    evidence "Everything this task is graded on is read from the aux-cni cluster through the kubeconfig at ~/.kube/aux-cni, and that request came back with no nodes at all — which is not the same as a node that is not Ready. Either the cluster is not reachable from this instance, or it no longer exists. It is a cluster of its own, separate from the one your other tasks use, and it is not something to rebuild: the task is to give the cluster that is there a pod network, not to replace it."
    exit 1
    ;;
esac

notready=$(printf '%s' "${nodes:-[]}" \
  | jq -r '[ .[] | select(.ready != "True") | .name ] | join(", ")' 2>/dev/null)

crit 2 "every node in aux-cni is Ready" \
  "not Ready: ${notready:-?}" \
  "A node is Ready only once its kubelet can start a Pod end to end, and the last thing it waits on is the container runtime's network. With no CNI configuration on disk the kubelet reports 'container runtime network not ready: NetworkReady=false ... cni plugin not initialized', the node lifecycle controller taints the node node.kubernetes.io/not-ready with both NoSchedule and NoExecute, and nothing is placed anywhere — which is why the whole cluster looks broken rather than merely unnetworked. Installing the pod network is what clears it: the plugin's Pod writes a CNI configuration and the plugin binaries onto the node, the kubelet notices within seconds, the condition flips and the taint is removed automatically. Nothing here is fixed by editing the node object; the taint is a symptom and deleting it by hand only hides the cause. Note the reverse is also true — a Ready node is not by itself proof the plugin finished rolling out, which is why that is graded separately." \
  -- [ -z "$notready" ]

crit_all_passed || evidence "$(crit_why)"
report "aux-cni's node is Ready"
