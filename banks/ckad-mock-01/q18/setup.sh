#!/usr/bin/env bash
set -euo pipefail
kubectl create ns lynx --dry-run=client -o yaml | kubectl apply -f -
kubectl -n lynx apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: reports
  namespace: lynx
spec:
  replicas: 1
  selector:
    matchLabels: {app: reports}
  template:
    metadata:
      labels: {app: reports}
    spec:
      containers:
        - name: web
          image: nginx:1.29-alpine
          ports: [{containerPort: 80}]
---
apiVersion: v1
kind: Service
metadata:
  name: reports
  namespace: lynx
spec:
  selector: {app: reports}
  ports:
    - port: 80
      targetPort: 80
EOF
kubectl -n lynx rollout status deploy/reports --timeout=180s
