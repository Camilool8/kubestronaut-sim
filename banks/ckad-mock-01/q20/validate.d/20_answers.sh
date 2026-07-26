#!/usr/bin/env bash
# points: 5
# desc: the node port really answers, from a node address inside the cluster
set -uo pipefail
node=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null)
[ -n "$node" ] || { echo "could not determine a node address"; exit 1; }

# Deliberately a node IP and not the ClusterIP: a Service left on
# ClusterIP still answers on its cluster address, so only this proves the
# NodePort is actually programmed. kube-proxy answers on every node, not
# just the one hosting a Pod.
out=$(kubectl -n aquila run np-probe-$RANDOM \
  --rm -i --restart=Never --image=nginx:1.29-alpine --command --timeout=25s -- \
  curl -s -m 5 "http://${node}:30081/" 2>/dev/null)
printf '%s' "$out" | grep -q 'status-ok' \
  && echo "node port answers" \
  || { echo "no answer on ${node}:30081 (got: $(printf '%s' "$out" | tr '\n' ' ' | head -c 120))"; exit 1; }
