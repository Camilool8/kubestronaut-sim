#!/usr/bin/env bash
set -euo pipefail

# Capture the evidence before the repair: fixing the probe rolls the Pods that
# carry these events out of existence.
{
  kubectl -n horologium describe pod -l app=session-store 2>/dev/null || true
  kubectl -n horologium get events --field-selector reason=Unhealthy \
    -o jsonpath='{range .items[*]}{.reason}{": "}{.message}{"\n"}{end}' 2>/dev/null || true
} > /opt/course/43/evidence

kubectl -n horologium patch deploy session-store -p '{
  "spec": {"template": {"spec": {"containers": [
    {"name": "store", "livenessProbe": {"httpGet": {"path": "/", "port": 80}}}
  ]}}}
}'
kubectl -n horologium rollout status deploy/session-store --timeout=180s
