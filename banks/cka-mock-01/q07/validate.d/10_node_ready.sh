#!/usr/bin/env bash
# points: 4
# desc: node sim-worker3 reports Ready again
set -uo pipefail
. /banks/_lib/checks.sh

NODE=sim-worker3

# Every node, not just this one: the pane has to be able to answer "which node
# is the broken one" as well as "is it fixed", because the commonest way this
# goes wrong is the right repair applied to the wrong machine. The Ready
# condition's reason and message are what the node controller writes when it
# stops hearing from a kubelet, so they belong in the evidence too.
nodes=$(kubectl get nodes -o json 2>/dev/null \
  | jq '[ .items[]? | {name: .metadata.name,
                       ready: ([ .status.conditions[]?
                                 | select(.type == "Ready") | .status ] | join("")),
                       reason: ([ .status.conditions[]?
                                  | select(.type == "Ready") | (.reason // "") ] | join("")),
                       message: ([ .status.conditions[]?
                                   | select(.type == "Ready") | (.message // "") ] | join("")),
                       kubeletVersion: (.status.nodeInfo.kubeletVersion // ""),
                       taints: [ .spec.taints[]? | "\(.key)=\(.value // ""):\(.effect)" ]} ]' 2>/dev/null)

evidence() {
  show_actual json "${nodes:-null}"
  show_why "$1"
}

node=$(printf '%s' "${nodes:-[]}" \
  | jq --arg n "$NODE" 'first(.[]? | select(.name == $n)) // empty' 2>/dev/null)

# Vacuous-pass guard, and a gate: a Node object that does not exist has no Ready
# condition to be wrong, and the rest of this question would then be graded
# against nothing at all.
[ -n "$node" ] || {
  echo "no node named $NODE in this cluster"
  evidence "This criterion is read from the Node object called $NODE, and the pane above lists the nodes the API knows about. Two things put an empty answer there. Either the name was wrong — cka-worker3 is a login alias in a client config file, and the API server has never heard of it, so use the names 'kubectl get nodes' prints — or the Node object was deleted. Deleting a Node repairs nothing: the machine keeps whatever state it was in, its kubelet re-registers it the moment it can talk to the API again, and while the object is missing there is no record of the outage at all. A node is brought back by fixing the machine, not by removing its entry."
  exit 1
}

ready=$(printf '%s' "$node" | jq -r '.ready // ""' 2>/dev/null)
reason=$(printf '%s' "$node" | jq -r '.reason // ""' 2>/dev/null)

# 'True' or not 'True', never 'False'. When a kubelet stops answering, the node
# controller does not decide the node is unhealthy — it decides it cannot tell,
# and writes Unknown. Testing for False would call an unreachable node fixed.
crit 4 "$NODE reports Ready" \
  "$NODE has Ready='${ready:-<none>}'${reason:+ (${reason})}, want True" \
  "The Ready condition is written by the node's own kubelet, roughly every ten seconds. When it stops arriving the node controller waits out a grace period of about forty-five seconds and then sets Ready to Unknown with reason NodeStatusUnknown — Unknown rather than False, because a silent node is not a node that reported a problem. So the fix is never made on the Node object: nothing you can do through the API writes this field. Log in to the machine and find out why its kubelet is not reporting — 'systemctl status kubelet' says whether the service is even meant to be running, and 'journalctl -u kubelet' says what happened the last time it was. Once the service is running again the node is Ready within a few seconds." \
  -- [ "$ready" = "True" ]

crit_all_passed || evidence "$(crit_why)"
report "$NODE is Ready again"
