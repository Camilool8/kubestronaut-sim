#!/usr/bin/env bash
set -euo pipefail
kubectl -n serpens patch svc inventory --type=merge -p '{
  "spec": {
    "selector": {"app": "inventory"},
    "ports": [{"port": 80, "targetPort": 8080, "protocol": "TCP"}]
  }
}'
out=$(kubectl -n serpens run svc-check-$RANDOM --rm -i --restart=Never \
  --image=nginx:1.29-alpine --command --timeout=120s -- \
  sh -c 'for i in 1 2 3 4 5 6 7 8 9 10; do
           curl -s -m 5 http://inventory.serpens.svc:80/ && exit 0
           sleep 3
         done; exit 1' 2>/dev/null)
printf '%s' "$out" | grep -o 'inventory' | head -1 > /opt/course/19/service-check
