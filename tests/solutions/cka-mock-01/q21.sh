#!/usr/bin/env bash
set -euo pipefail

NS=octans
NODE=sim-worker2

# --overwrite on both, so a re-run of this script is a no-op rather than an
# "already has a taint with that key" failure.
kubectl taint nodes "$NODE" workload=batch:NoSchedule --overwrite
kubectl label nodes "$NODE" workload=batch --overwrite

# One patch: the hostname pin goes (null is how a merge patch deletes a field),
# the toleration gets the Pods past the taint, and the required node affinity is
# what makes the batch node the only place they can go.
kubectl -n "$NS" patch deploy batch-runner --type=merge -p '{
  "spec": {"template": {"spec": {
    "nodeSelector": null,
    "tolerations": [{"key": "workload", "operator": "Equal",
                     "value": "batch", "effect": "NoSchedule"}],
    "affinity": {"nodeAffinity": {"requiredDuringSchedulingIgnoredDuringExecution": {
      "nodeSelectorTerms": [{"matchExpressions": [
        {"key": "workload", "operator": "In", "values": ["batch"]}]}]}}}
  }}}
}'

kubectl -n "$NS" rollout status deploy/batch-runner --timeout=180s

replicas=$(kubectl -n "$NS" get deploy batch-runner -o jsonpath='{.spec.replicas}')
ok=''
for _ in $(seq 1 40); do
  placed=$(kubectl -n "$NS" get pod -l app=batch-runner -o json \
    | jq '[.items[] | select(.metadata.deletionTimestamp == null) | (.spec.nodeName // "")]')
  here=$(printf '%s' "$placed" | jq --arg n "$NODE" '[.[] | select(. == $n)] | length')
  away=$(printf '%s' "$placed" | jq --arg n "$NODE" '[.[] | select(. != $n and . != "")] | length')
  if [ "$here" -ge "${replicas:-2}" ] && [ "$away" -eq 0 ]; then ok=1; break; fi
  sleep 3
done

[ -n "$ok" ] || {
  echo "batch-runner Pods did not all land on $NODE" >&2
  kubectl -n "$NS" get pod -o wide >&2 || true
  exit 1
}
