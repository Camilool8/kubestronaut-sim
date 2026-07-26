#!/usr/bin/env bash
# points: 3
# desc: report-cache installed from sim-cache with 2 replicas set via values
set -uo pipefail
export HELM_NAMESPACE=carina
chart=$(helm ls -o json 2>/dev/null | jq -r '.[] | select(.name == "report-cache") | .chart')
[ -n "$chart" ] || { echo "report-cache is not installed"; exit 1; }
printf '%s' "$chart" | grep -q '^sim-cache-' || { echo "report-cache uses chart '$chart', want sim-cache"; exit 1; }

replicas=$(kubectl -n carina get deploy report-cache -o jsonpath='{.spec.replicas}' 2>/dev/null)
[ "$replicas" = "2" ] || { echo "Deployment report-cache has $replicas replicas, want 2"; exit 1; }

# The question says "through Helm values", so the release's own values
# have to carry it. Scaling the Deployment afterwards would satisfy the
# check above and be undone by the next `helm upgrade`.
value=$(helm -n carina get values report-cache -o json 2>/dev/null | jq -r '.replicaCount // empty')
[ "$value" = "2" ] \
  && echo "installed with replicaCount=2" \
  || { echo "release values do not set replicaCount=2 (got '$value') — was the Deployment scaled instead?"; exit 1; }
