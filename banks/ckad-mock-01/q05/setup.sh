#!/usr/bin/env bash
set -euo pipefail
kubectl create ns lyra --dry-run=client -o yaml | kubectl apply -f -
kubectl -n lyra apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: feed-source
  namespace: lyra
spec:
  replicas: 1
  selector:
    matchLabels: {app: feed-source}
  template:
    metadata:
      labels: {app: feed-source}
    spec:
      containers:
        - name: web
          image: nginx:1.29-alpine
          ports: [{containerPort: 80}]
---
apiVersion: v1
kind: Service
metadata:
  name: feed-source
  namespace: lyra
spec:
  selector:
    app: feed-source
  ports:
    - port: 80
      targetPort: 80
EOF
kubectl -n lyra rollout status deploy/feed-source --timeout=180s
