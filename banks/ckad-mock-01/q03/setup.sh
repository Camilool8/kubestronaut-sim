#!/usr/bin/env bash
set -euo pipefail
kubectl create ns orbit --dry-run=client -o yaml | kubectl apply -f -
for role in frontend api metrics; do
  kubectl -n orbit apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: $role
  namespace: orbit
spec:
  replicas: 1
  selector:
    matchLabels: {role: $role}
  template:
    metadata:
      labels: {role: $role}
    spec:
      containers:
      - name: main
        image: nginx:1.29-alpine
        ports: [{containerPort: 80}]
EOF
done
