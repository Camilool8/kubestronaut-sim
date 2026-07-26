#!/usr/bin/env bash
# points: 3
# desc: ServiceAccount pipeline-runner exists and the pipeline Deployment uses it
set -uo pipefail
kubectl -n phoenix get serviceaccount pipeline-runner >/dev/null 2>&1 \
  || { echo "ServiceAccount pipeline-runner does not exist"; exit 1; }

sa=$(kubectl -n phoenix get deploy pipeline \
  -o jsonpath='{.spec.template.spec.serviceAccountName}' 2>/dev/null)
[ "$sa" = "pipeline-runner" ] || { echo "pipeline runs as '$sa', want pipeline-runner"; exit 1; }

ready=$(kubectl -n phoenix get deploy pipeline -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "$ready" = "1" ] \
  && echo "service account wired up" \
  || { echo "readyReplicas is '$ready', want 1"; exit 1; }
