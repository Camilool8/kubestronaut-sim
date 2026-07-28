#!/usr/bin/env bash
# points: 3
# desc: payments-api is back on nginx:1.27-alpine with 4 ready replicas
set -uo pipefail
img=$(kubectl -n draco get deploy payments-api \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].image}' 2>/dev/null)
[ "$img" = "nginx:1.27-alpine" ] || { echo "image is '$img', want nginx:1.27-alpine"; exit 1; }

spec=$(kubectl -n draco get deploy payments-api -o jsonpath='{.spec.replicas}' 2>/dev/null)
ready=$(kubectl -n draco get deploy payments-api -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "$spec" = "4" ] || { echo "spec.replicas is '$spec', want 4"; exit 1; }
[ "$ready" = "4" ] \
  && echo "rolled back, 4/4 ready" \
  || { echo "readyReplicas is '$ready', want 4"; exit 1; }
