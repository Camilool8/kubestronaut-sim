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
#
# `exec` into a Pod the question already runs rather than creating a
# probe Pod: scheduling one costs most of the 30s a check is allowed,
# and this check timed out — and silently cost 5 points — when two
# graders ran back-to-back.
out=$(kubectl -n aquila exec deploy/status-page -- \
  sh -c "for i in 1 2 3; do curl -s -m 4 http://${node}:30081/ && exit 0; sleep 2; done; exit 1" 2>/dev/null)
printf '%s' "$out" | grep -q 'status-ok' \
  && echo "node port answers" \
  || { echo "no answer on ${node}:30081 (got: $(printf '%s' "$out" | tr '\n' ' ' | head -c 120))"; exit 1; }
