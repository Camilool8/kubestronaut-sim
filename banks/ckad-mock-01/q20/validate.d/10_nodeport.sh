#!/usr/bin/env bash
# points: 3
# desc: status-page is a NodePort Service on port 80 with node port 30081
# expected: service.yaml yaml
set -uo pipefail
. /banks/_lib/checks.sh

snapshot() {
  kubectl -n aquila get svc status-page -o json 2>/dev/null | jq -S '
    {type: (.spec.type // null),
     nodePort: ((.spec.ports[]? | select(.port == 80) | .nodePort) // null)}' \
    | yq -p json -o yaml -P 2>/dev/null
}

evidence() {
  show_pair yaml service.yaml
  show_why "$1"
}

type=$(kubectl -n aquila get svc status-page -o jsonpath='{.spec.type}' 2>/dev/null)
np=$(kubectl -n aquila get svc status-page \
  -o jsonpath='{.spec.ports[?(@.port==80)].nodePort}' 2>/dev/null)

crit 2 "type NodePort" \
  "type is '$type', want NodePort" \
  "A NodePort Service is a ClusterIP Service PLUS a port opened on every node — the cluster IP keeps working exactly as before and the node port is additional, which is why nothing inside the cluster notices the change. The type field is what opens it." \
  -- [ "$type" = "NodePort" ]

crit 1 "still publishes port 80" \
  "the Service publishes no port 80" \
  "port is what clients connect to on the Service, and the question keeps it at 80. Nothing in this Service publishes that port, so there is no entry for a node port to hang off — a Service's ports are a list and each entry carries port, targetPort and nodePort together." \
  -- [ -n "$np" ]

crit 1 "node port pinned to 30081" \
  "nodePort for port 80 is '$np', want 30081" \
  "Leave nodePort out and the cluster allocates one at random from its node-port range, which is normally what you want. Pinning it is for when something outside the cluster has the number written down — and pinning one already in use makes the Service rejected rather than silently moved." \
  -- [ "$np" = "30081" ]

crit_all_passed || evidence "$(crit_why)"
report "nodeport ok"
