#!/usr/bin/env bash
set -euo pipefail
kubectl -n volans patch deploy edge-cache -p '{
  "spec": {"template": {"spec": {
    "terminationGracePeriodSeconds": 45,
    "containers": [
      {"name": "cache", "imagePullPolicy": "Never"},
      {"name": "refresher", "imagePullPolicy": "Never"}
    ]
  }}}
}'
kubectl -n volans rollout status deploy/edge-cache --timeout=180s
