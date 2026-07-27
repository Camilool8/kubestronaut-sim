#!/usr/bin/env bash
# points: 4
# desc: the overlay was applied to pavo and is running
set -uo pipefail
img=$(kubectl -n pavo get deploy staging-cargo-api \
  -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null)
[ "$img" = "nginx:1.29-alpine" ] || { echo "deployed image is '$img', want nginx:1.29-alpine"; exit 1; }

ready=$(kubectl -n pavo get deploy staging-cargo-api -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "$ready" = "3" ] || { echo "readyReplicas is '$ready', want 3"; exit 1; }

kubectl -n pavo get svc staging-cargo-api >/dev/null 2>&1 \
  || { echo "Service staging-cargo-api is missing from namespace pavo"; exit 1; }
echo "applied and running"
