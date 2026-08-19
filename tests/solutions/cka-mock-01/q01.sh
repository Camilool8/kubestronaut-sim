#!/usr/bin/env bash
set -euo pipefail
# Both faults in one patch: the tag that resolves nowhere, and the probe aimed
# at a port the container never opened. Named container, so the merge lands on
# the right one.
kubectl -n orion patch deploy telemetry-api --type=strategic -p '{
  "spec": {"template": {"spec": {"containers": [{
    "name": "api",
    "image": "nginx:1.29-alpine",
    "readinessProbe": {"httpGet": {"path": "/", "port": 8080}}
  }]}}}
}'

ready=0
for _ in $(seq 1 60); do
  ready=$(kubectl -n orion get deploy telemetry-api \
    -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0)
  [ "${ready:-0}" = "3" ] && break
  sleep 3
done
[ "${ready:-0}" = "3" ] || {
  echo "telemetry-api did not reach 3 ready replicas" >&2
  kubectl -n orion get pod -l app=telemetry-api >&2 || true
  exit 1
}
