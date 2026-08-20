#!/usr/bin/env bash
set -euo pipefail

# The strategic merge matches the container by name and the env var by name, so
# it rewrites only DB_ENDPOINT's key and leaves LOG_LEVEL as it was.
kubectl -n lyra patch deploy payments-api --type=strategic -p '{"spec":{"template":{"spec":{"containers":[{"name":"api","env":[{"name":"DB_ENDPOINT","valueFrom":{"configMapKeyRef":{"name":"payments-config","key":"DB_ENDPOINT"}}}]}]}}}}'

kubectl -n lyra rollout status deploy/payments-api --timeout=180s

seen=$(kubectl -n lyra exec deploy/payments-api -- printenv DB_ENDPOINT)
[ "$seen" = "postgres.lyra.svc.cluster.local:5432" ] || {
  echo "container sees DB_ENDPOINT='$seen'" >&2
  exit 1
}
