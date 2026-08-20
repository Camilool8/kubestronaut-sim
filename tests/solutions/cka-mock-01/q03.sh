#!/usr/bin/env bash
set -euo pipefail
kubectl -n draco patch svc nova-api --type=merge -p '{
  "spec": {
    "selector": {"app": "nova-api"},
    "ports": [{"port": 80, "targetPort": "http-api", "protocol": "TCP"}]
  }
}'

# The endpoint list is written by a controller, so it lags the patch. Poll it
# rather than sleeping a guessed interval.
count=0
i=0
while [ "$i" -lt 20 ]; do
  count=$(kubectl -n draco get endpointslice -l kubernetes.io/service-name=nova-api -o json \
    | jq '[.items[].endpoints[]? | select(.conditions.ready == true)] | length')
  [ "$count" = "2" ] && break
  i=$((i + 1))
  sleep 3
done

kubectl -n draco exec deploy/nova-api -- \
  sh -c 'for i in 1 2 3 4 5; do
           curl -s -m 5 http://nova-api.draco.svc:80/ && exit 0
           sleep 3
         done; exit 1'

printf '%s\n' "$count" > /opt/course/3/endpoints
