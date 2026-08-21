#!/usr/bin/env bash
# points: 3
# desc: sim-worker2 carries the workload=batch:NoSchedule taint and the workload=batch label, and no other node does
# expected: nodes.json json
set -uo pipefail
. /banks/_lib/checks.sh

NODE=sim-worker2

# One projection for the whole cluster: the pane has to answer "which node
# carries what" rather than "does this one node carry it", because the two ways
# this half goes wrong are the reservation landing on the wrong node and it
# landing on several.
nodes=$(kubectl get nodes -o json 2>/dev/null \
  | jq -S '[.items[]? | {name: .metadata.name,
                      "labels.workload": (.metadata.labels.workload // null),
                      taints: [.spec.taints[]? | {key, value, effect}]}]' 2>/dev/null)

snapshot() {
  printf '%s' "${nodes:-null}"
}

evidence() {
  show_pair json nodes.json
  show_why "$1"
}

node=$(printf '%s' "${nodes:-[]}" \
  | jq --arg n "$NODE" 'first(.[]? | select(.name == $n)) // empty' 2>/dev/null)

[ -n "$node" ] || {
  echo "no node named $NODE in this cluster"
  show_actual text "nodes that exist: $(name_list "$(kubectl get nodes -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)")"
  show_why "Every criterion here is read from the node object called $NODE, and the pane above lists the nodes that exist. The reservation has to be made on that node under that name: the login alias cka-worker2 reaches the same machine, but it is a name in a client config file and the API server has never heard of it, so 'kubectl taint nodes cka-worker2 ...' fails outright. 'kubectl get nodes' prints the names the API answers to, and they are the ones to use."
  exit 1
}

# Do-no-harm, so a gate rather than a criterion: a dedicated node is only
# dedicated while it is the only one. Tainting or labelling the rest of the
# cluster would get batch-runner scheduled somewhere too, and it would push
# every other workload around on the way. Nothing carries either at seed, so
# this cannot fire on an untouched environment.
others=$(printf '%s' "${nodes:-[]}" | jq -r --arg n "$NODE" '
  [ .[]? | select(.name != $n)
         | select( (.["labels.workload"] == "batch")
                   or any(.taints[]?; .key == "workload" and .value == "batch"
                                      and .effect == "NoSchedule") )
         | .name ] | join(", ")' 2>/dev/null)

[ -z "$others" ] || {
  echo "the workload=batch reservation is also on: $others — it belongs to $NODE alone"
  evidence "The point of a taint plus a label is that ONE node is set aside: the taint keeps everything else off it, and the label is what batch-runner's affinity then asks for. Put the label on a second node and the scheduler is free to send batch Pods there instead; put the taint on a second node and every workload without that toleration is barred from it too, which on this cluster is nearly everything that runs. Remove the extras — 'kubectl taint nodes <node> workload-' drops a taint by key and 'kubectl label nodes <node> workload-' drops the label."
  exit 1
}

tainted=$(printf '%s' "$node" | jq -r '
  if any(.taints[]?; .key == "workload" and .value == "batch" and .effect == "NoSchedule")
  then "yes" else "no" end' 2>/dev/null)
taints_seen=$(printf '%s' "$node" | jq -r '
  [ .taints[]? | "\(.key)=\(.value // ""):\(.effect)" ]
  | if length == 0 then "none" else join(" ") end' 2>/dev/null)
label=$(printf '%s' "$node" | jq -r '.["labels.workload"] // ""' 2>/dev/null)

crit 2 "$NODE is tainted workload=batch:NoSchedule" \
  "$NODE carries no workload=batch:NoSchedule taint (taints: ${taints_seen:-none})" \
  "The taint is the half that keeps everything else off the node: NoSchedule tells the scheduler to place no new Pod there unless the Pod tolerates it. Key, value and effect are all graded because all three are matched at scheduling time — workload=batch:NoExecute would additionally evict what is already running there, and a taint written without a value is a different taint that a different toleration has to match. 'kubectl taint nodes $NODE workload=batch:NoSchedule' writes it; note that it does NOT move the Pods already on the node, since NoSchedule only ever decides new placements." \
  -- [ "$tainted" = yes ]

crit 1 "$NODE is labelled workload=batch" \
  "the workload label on $NODE is '${label:-<none>}', want batch" \
  "The taint alone would make this node unused rather than dedicated: a taint only ever says who is turned away, and nothing in it says who belongs here. The label is the half batch-runner's node affinity selects on, and it is an ordinary node label — 'kubectl label nodes $NODE workload=batch'. Taints and labels are separate fields; writing the taint does not create a label of the same name, which is the most common way this task ends up half done." \
  -- [ "$label" = batch ]

crit_all_passed || evidence "$(crit_why)"
report "$NODE reserved for batch work"
