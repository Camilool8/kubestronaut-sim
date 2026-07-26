#!/usr/bin/env bash
set -euo pipefail
kubectl -n draco get deploy payments-api \
  -o jsonpath='{.metadata.annotations.deployment\.kubernetes\.io/revision}' \
  > /opt/course/12/revision-before

kubectl -n draco set image deploy/payments-api api=nginx:1.29-alpine
kubectl -n draco annotate deploy/payments-api \
  kubernetes.io/change-cause="upgrade to nginx 1.29" --overwrite
kubectl -n draco rollout status deploy/payments-api --timeout=180s

kubectl -n draco scale deploy/payments-api --replicas=4
kubectl -n draco rollout status deploy/payments-api --timeout=180s

kubectl -n draco rollout undo deploy/payments-api
kubectl -n draco rollout status deploy/payments-api --timeout=180s

kubectl -n draco rollout history deploy/payments-api > /opt/course/12/history
