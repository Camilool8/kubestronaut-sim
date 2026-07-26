#!/usr/bin/env bash
set -euo pipefail
kubectl create ns hydra --dry-run=client -o yaml | kubectl apply -f -
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
---
apiVersion: v1
kind: Service
metadata:
  name: orders-api
  namespace: hydra
spec:
  selector: {app: orders-api}
  ports:
    - port: 80
      targetPort: 80
EOF
kubectl -n hydra rollout status deploy/orders-api --timeout=180s
