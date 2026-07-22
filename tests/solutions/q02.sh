#!/usr/bin/env bash
set -euo pipefail
mkdir -p /opt/course/2
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
kubectl -n nova rollout status deploy nova-api --timeout=180s
