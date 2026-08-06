#!/usr/bin/env bash
set -euo pipefail
kubectl create ns volans --dry-run=client -o yaml | kubectl apply -f -

kubectl -n volans apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: edge-cache
  namespace: volans
spec:
  replicas: 2
  selector:
    matchLabels: {app: edge-cache}
  template:
    metadata:
      labels: {app: edge-cache}
    spec:
      containers:
        - name: cache
          image: nginx:1.29-alpine
          ports: [{containerPort: 80}]
        - name: refresher
          image: busybox:1.37
          command: ["sh", "-c", "while true; do echo 'refresher: cache warm'; sleep 20; done"]
EOF

kubectl -n volans rollout status deploy/edge-cache --timeout=180s
