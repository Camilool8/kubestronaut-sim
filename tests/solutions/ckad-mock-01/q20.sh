#!/usr/bin/env bash
set -euo pipefail
kubectl -n aquila patch svc status-page --type=merge -p \
  '{"spec":{"type":"NodePort","ports":[{"port":80,"targetPort":80,"nodePort":30081,"protocol":"TCP"}]}}'
node=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
for _ in $(seq 1 20); do
  out=$(kubectl -n aquila run np-check-$RANDOM --rm -i --restart=Never \
    --image=nginx:1.29-alpine --command --timeout=60s -- \
    curl -s -m 5 "http://${node}:30081/" 2>/dev/null) || true
  printf '%s' "$out" | grep -q 'status-ok' && break
  sleep 3
done
printf '%s' "$out" | grep -o 'status-ok' > /opt/course/20/nodeport-check
