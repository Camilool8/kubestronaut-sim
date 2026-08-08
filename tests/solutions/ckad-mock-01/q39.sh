#!/usr/bin/env bash
set -euo pipefail
kubectl -n telescopium apply -f - <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: shard
  namespace: telescopium
spec:
  clusterIP: None
  selector:
    app: shard
  ports:
    - port: 80
      targetPort: 80
EOF

for _ in $(seq 1 20); do
  n=$(kubectl -n telescopium get endpointslice -l kubernetes.io/service-name=shard -o json \
    | jq '[.items[].endpoints[]? | select(.conditions.ready == true)] | length')
  [ "$n" = "3" ] && break
  sleep 3
done

kubectl -n telescopium get endpointslice -l kubernetes.io/service-name=shard -o json \
  | jq -r '[.items[].endpoints[]? | select(.conditions.ready == true) | .addresses[]?] | unique | .[]' \
  > /opt/course/39/shard-addresses

out=""
for _ in $(seq 1 10); do
  out=$(kubectl -n telescopium exec shard-0 -- \
    curl -s -m 5 http://shard-2.shard.telescopium.svc.cluster.local/ 2>/dev/null) || true
  printf '%s' "$out" | grep -q 'shard-2' && break
  sleep 3
done
printf '%s' "$out" | grep -q 'shard-2'
