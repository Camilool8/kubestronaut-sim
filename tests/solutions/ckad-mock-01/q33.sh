#!/usr/bin/env bash
set -euo pipefail
kubectl -n lupus apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: search-canary
  namespace: lupus
spec:
  replicas: 1
  selector:
    matchLabels:
      app: search
      track: canary
  template:
    metadata:
      labels:
        app: search
        track: canary
    spec:
      containers:
        - name: web
          image: nginx:1.29-alpine
          ports:
            - containerPort: 80
EOF

kubectl -n lupus scale deploy/search-stable --replicas=4
kubectl -n lupus rollout status deploy/search-canary --timeout=180s
kubectl -n lupus rollout status deploy/search-stable --timeout=180s
