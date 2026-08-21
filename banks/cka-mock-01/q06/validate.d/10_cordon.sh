#!/usr/bin/env bash
# points: 2
# desc: node sim-worker4 is marked unschedulable
# expected: cordon.json json
set -uo pipefail
. /banks/_lib/checks.sh

NODE=sim-worker4

# The whole node list, not just this one: the pane has to be able to answer
# "which node did I close" as well as "is it closed", because the commonest way
# this half goes wrong is the right command aimed at the wrong name.
nodes=$(kubectl get nodes -o json 2>/dev/null \
  | jq '[ .items[]? | {name: .metadata.name,
                       unschedulable: (.spec.unschedulable // false),
                       ready: ([ .status.conditions[]?
                                 | select(.type == "Ready") | .status ] | join(""))} ]' 2>/dev/null)

node=$(printf '%s' "${nodes:-[]}" \
  | jq --arg n "$NODE" 'first(.[]? | select(.name == $n)) // empty' 2>/dev/null)

# Vacuous-pass guard, and a gate: with the Node object deleted there is nothing
# to be unschedulable and nothing can be running "on it", so every criterion in
# this question would be met by an object that no longer exists.
[ -n "$node" ] || {
  echo "no node named $NODE in this cluster"
  show_actual json "${nodes:-null}"
  show_why "This criterion is read from the node object called $NODE, and the pane above lists the nodes the API knows about. Two things put an empty answer there. Either the name was wrong — cka-worker4 is a login alias in a client config file and the API server has never heard of it, so use the names 'kubectl get nodes' prints — or the Node object was deleted. Deleting a Node takes nothing out of service: the machine keeps running its Pods, its kubelet re-registers it moments later, and in the meantime the API has no record of the maintenance you were asked to arrange. Taking a node out of service is a change to that object, not the removal of it."
  exit 1
}

snapshot() {
  printf '%s' "${node:-null}" | jq -S '{unschedulable: (.unschedulable // false)}' 2>/dev/null
}

evidence() {
  show_pair json cordon.json
  show_why "$1"
}

unsched=$(printf '%s' "$node" | jq -r '.unschedulable' 2>/dev/null)

crit 2 "$NODE is unschedulable" \
  "$NODE has .spec.unschedulable='${unsched:-false}', want true" \
  "Marking a node unschedulable is what stops the scheduler placing anything NEW on it — the flag lives on the Node itself (spec.unschedulable), which is why it survives everything the workloads above it do. 'kubectl cordon $NODE' sets it, and 'kubectl drain $NODE' sets it too before it starts evicting: a drain that reached its first eviction has already cordoned the node, so this is normally free. It is deliberately not the same thing as evicting: cordoning alone leaves every running Pod exactly where it is, which is why the second half of this task exists. Note that the taint already on this node does not do it — a taint is matched against a Pod's tolerations and this workload tolerates it, while unschedulable turns away everything." \
  -- [ "$unsched" = true ]

crit_all_passed || evidence "$(crit_why)"
report "$NODE is closed to new Pods"
