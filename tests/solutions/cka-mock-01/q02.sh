#!/usr/bin/env bash
set -euo pipefail
kubectl label node sim-worker disk=ssd --overwrite
kubectl -n cka-sched delete pod fast-store --ignore-not-found >/dev/null
kubectl -n cka-sched run fast-store --image=nginx:1.29-alpine \
  --overrides='{"spec":{"nodeSelector":{"disk":"ssd"}}}'
kubectl -n cka-sched wait --for=condition=Ready pod/fast-store --timeout=120s
kubectl -n cka-sched get pod fast-store -o jsonpath='{.spec.nodeName}' > /opt/course/2/node
