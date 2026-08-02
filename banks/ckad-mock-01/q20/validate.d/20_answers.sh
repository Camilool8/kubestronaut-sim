#!/usr/bin/env bash
# points: 5
# desc: the node port really answers, from a node address inside the cluster
set -uo pipefail
. /banks/_lib/checks.sh
# Every node's InternalIP, then take one. Not items[0]: the check does not
# care *which* node answers — kube-proxy programs the node port on all of
# them, which is the property being tested — so asking for a specific
# position in the node list implied a requirement that does not exist.
node=$(kubectl get nodes -o jsonpath='{.items[*].status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null \
  | tr ' ' '\n' | grep -v '^$' | head -1)
evidence() {
  show_actual text "$(kubectl -n aquila get svc status-page 2>/dev/null; echo; kubectl -n aquila get endpointslice -l kubernetes.io/service-name=status-page 2>/dev/null)"
  show_why "$1"
}

[ -n "$node" ] || {
  echo "could not determine a node address"
  show_actual text "$(kubectl get nodes -o wide 2>/dev/null)"
  show_why "No node reported an InternalIP, so there is no address to send a node-port request to. That is a property of the cluster rather than of the answer."
  exit 1
}

# Deliberately a node IP and not the ClusterIP: a Service left on
# ClusterIP still answers on its cluster address, so only this proves the
# NodePort is actually programmed. kube-proxy answers on every node, not
# just the one hosting a Pod.
#
# `exec` into a Pod the question already runs rather than creating a
# probe Pod: scheduling one costs most of the 30s a check is allowed,
# and this check timed out — and silently cost 5 points — when two
# graders ran back-to-back.
out=$(kubectl -n aquila exec deploy/status-page -- \
  sh -c "for i in 1 2 3; do curl -s -m 4 http://${node}:30081/ && exit 0; sleep 2; done; exit 1" 2>/dev/null)
printf '%s' "$out" | grep -q 'status-ok' && echo "node port answers" || {
  echo "no answer on ${node}:30081 (got: $(printf '%s' "$out" | tr '\n' ' ' | head -c 120))"
  evidence "kube-proxy programs a node port on EVERY node, so any node's address answers and there is no need to find the one running a Pod. Nothing answered on this one. A Service still on ClusterIP answers perfectly well on its cluster address and not at all here, which is precisely why the request is sent to a node address — and the PORT(S) column above shows both numbers when the node port really exists."
  exit 1
}
