#!/usr/bin/env bash
set -euo pipefail
kubectl create ns carina --dry-run=client -o yaml | kubectl apply -f -

helm repo update >/dev/null 2>&1 || true

helm -n carina upgrade --install report-api-v1 sim/sim-web --version 1.0.0 --wait --timeout 3m >/dev/null
helm -n carina upgrade --install report-api-v2 sim/sim-web --version 1.0.0 --wait --timeout 3m >/dev/null
helm -n carina upgrade --install report-web    sim/sim-web --version 1.1.0 --wait --timeout 3m >/dev/null

if ! helm -n carina status report-legacy >/dev/null 2>&1; then
  helm -n carina install report-legacy sim/sim-web --version 1.0.0 \
    --set image.tag=this-tag-does-not-exist --wait --timeout 45s >/dev/null 2>&1 || true
fi
