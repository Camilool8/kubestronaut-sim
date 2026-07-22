#!/usr/bin/env bash
set -euo pipefail
kubectl create ns nova --dry-run=client -o yaml | kubectl apply -f -
kubectl -n nova apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nova-api
  namespace: nova
spec:
  replicas: 1
  selector:
    matchLabels: {app: nova-api}
  template:
    metadata:
      labels: {app: nova-api}
    spec:
      containers:
      - name: api
        image: nginx:1.99
EOF
