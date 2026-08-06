#!/usr/bin/env bash
set -euo pipefail
kubectl -n lacerta patch svc checkout --type=merge \
  -p '{"spec":{"selector":{"app":"checkout","release":"green"}}}'

for _ in $(seq 1 15); do
  body=$(kubectl -n lacerta exec deploy/checkout-client -- \
    wget -q -T 4 -O - http://checkout.lacerta.svc:80/ 2>/dev/null || true)
  case "$body" in *green*) exit 0 ;; esac
  sleep 2
done
echo "the Service never served the green release" >&2
exit 1
