#!/usr/bin/env bash
set -euo pipefail
kubectl -n pyxis rollout pause deploy/feed-api
kubectl -n pyxis set image deploy/feed-api api=nginx:1.29-alpine

kubectl -n pyxis get rs -o name | wc -l | tr -d '[:space:]' \
  > /opt/course/31/replicasets-while-paused

kubectl -n pyxis rollout resume deploy/feed-api
kubectl -n pyxis rollout status deploy/feed-api --timeout=180s
