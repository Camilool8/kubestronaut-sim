#!/usr/bin/env bash
set -euo pipefail
kubectl create ns draco --dry-run=client -o yaml | kubectl apply -f -
kubectl -n draco apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments-api
  namespace: draco
  annotations:
    kubernetes.io/change-cause: "initial deployment"
spec:
  replicas: 2
  selector:
    matchLabels: {app: payments-api}
  template:
    metadata:
      labels: {app: payments-api}
    spec:
      containers:
        - name: api
          image: nginx:1.27-alpine
          ports: [{containerPort: 80}]
EOF
kubectl -n draco rollout status deploy/payments-api --timeout=180s
