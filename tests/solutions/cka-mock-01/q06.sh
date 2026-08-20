#!/usr/bin/env bash
set -euo pipefail

NS=aquila
NODE=sim-worker4
DEP=telemetry-collector
REPLICAS=2

# One command for both halves. --ignore-daemonsets covers calico-node and
# kube-proxy, which a DaemonSet would put straight back; --delete-emptydir-data
# covers the collector's scratch volume, whose data lives on this node's disk.
# Without either flag drain refuses and evicts nothing. It cordons first and
# returns only once every Pod it took on is gone, so there is nothing to wait
# for afterwards.
kubectl drain "$NODE" --ignore-daemonsets --delete-emptydir-data --timeout=180s

# The ReplicaSet's replacements are created the moment the old Pods are
# deleted, but "created" and "visible to a list" are a second apart, and the
# grader counts them. Wait for the state the checks read rather than assuming
# it has settled.
ok=''
for _ in $(seq 1 30); do
  unsched=$(kubectl get node "$NODE" -o jsonpath='{.spec.unschedulable}' 2>/dev/null)

  left=$(kubectl get pods -A --field-selector "spec.nodeName=$NODE" -o json 2>/dev/null | jq '
    [ .items[]? | select(.metadata.deletionTimestamp == null)
                | select(.metadata.annotations["kubernetes.io/config.mirror"] == null)
                | select( any(.metadata.ownerReferences[]?.kind; . == "DaemonSet") | not ) ]
    | length')

  alive=$(kubectl -n "$NS" get pod -l "app=$DEP" -o json 2>/dev/null | jq '
    [ .items[]? | select(.metadata.deletionTimestamp == null) ] | length')

  if [ "$unsched" = true ] && [ "${left:-1}" -eq 0 ] && [ "${alive:-0}" -ge "$REPLICAS" ]; then
    ok=1
    break
  fi
  sleep 3
done

[ -n "$ok" ] || {
  echo "$NODE was not left cordoned and empty with $DEP waiting" >&2
  kubectl get node "$NODE" >&2 || true
  kubectl get pods -A -o wide --field-selector "spec.nodeName=$NODE" >&2 || true
  kubectl -n "$NS" get pod -o wide >&2 || true
  exit 1
}
