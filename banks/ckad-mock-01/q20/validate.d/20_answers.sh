#!/usr/bin/env bash
# points: 5
# desc: the node port really answers, from a node address inside the cluster
set -uo pipefail
. /banks/_lib/checks.sh
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

out=$(kubectl -n aquila exec deploy/status-page -- \
  sh -c "for i in 1 2 3; do curl -s -m 4 http://${node}:30081/ && exit 0; sleep 2; done; exit 1" 2>/dev/null)
printf '%s' "$out" | grep -q 'status-ok' && echo "node port answers" || {
  echo "no answer on ${node}:30081 (got: $(printf '%s' "$out" | tr '\n' ' ' | head -c 120))"
  evidence "kube-proxy programs a node port on EVERY node, so any node's address answers and there is no need to find the one running a Pod. Nothing answered on this one. A Service still on ClusterIP answers perfectly well on its cluster address and not at all here, which is precisely why the request is sent to a node address — and the PORT(S) column above shows both numbers when the node port really exists."
  exit 1
}
