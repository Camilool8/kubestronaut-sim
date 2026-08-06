#!/usr/bin/env bash
set -euo pipefail
kubectl -n nova get deploy nova-api \
  -o jsonpath='{.spec.template.spec.containers[0].image}' > /opt/course/2/old-image
kubectl -n nova patch deploy nova-api --type=strategic -p '{
  "spec": {
    "replicas": 3,
    "strategy": {"rollingUpdate": {"maxSurge": 1, "maxUnavailable": 0}},
    "template": {"spec": {"containers": [{
      "name": "api",
      "image": "nginx:1.29-alpine",
      "readinessProbe": {
        "httpGet": {"path": "/", "port": 80},
        "initialDelaySeconds": 5, "periodSeconds": 10
      }
    }]}}
  }
}'
ready=0
for _ in $(seq 1 60); do
  ready=$(kubectl -n nova get deploy nova-api -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0)
  [ "${ready:-0}" = "3" ] && break
  sleep 3
done
[ "${ready:-0}" = "3" ] || { echo "nova-api did not reach 3 ready replicas" >&2; exit 1; }
