#!/usr/bin/env bash
set -euo pipefail
kubectl -n hydra apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders-api
  namespace: hydra
spec:
  replicas: 2
  selector:
    matchLabels: {app: orders-api}
  template:
    metadata:
      labels: {app: orders-api}
    spec:
      containers:
        - name: api
          image: nginx:1.29-alpine
          ports: [{containerPort: 80}]
          startupProbe:
            httpGet: {path: /, port: 80}
            periodSeconds: 2
            failureThreshold: 30
          readinessProbe:
            httpGet: {path: /, port: 80}
            periodSeconds: 5
            failureThreshold: 2
          livenessProbe:
            httpGet: {path: /, port: 80}
            initialDelaySeconds: 10
            periodSeconds: 10
EOF
kubectl -n hydra rollout status deploy/orders-api --timeout=180s
