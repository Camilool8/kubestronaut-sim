#!/usr/bin/env bash
set -euo pipefail
# No --type, i.e. the STRATEGIC merge patch kubectl uses by default for a
# built-in resource. --type=merge is RFC 7386, which replaces a list
# outright rather than merging it, so the same body under it deletes both
# containers' images and the API refuses the Deployment as invalid.
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
