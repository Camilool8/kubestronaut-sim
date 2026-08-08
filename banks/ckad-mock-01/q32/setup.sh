#!/usr/bin/env bash
set -euo pipefail
kubectl create ns sagitta --dry-run=client -o yaml | kubectl apply -f -

kubectl -n sagitta apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: session-store-conf
  namespace: sagitta
data:
  SESSION_TTL: "3600"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: session-store
  namespace: sagitta
spec:
  replicas: 3
  selector:
    matchLabels: {app: session-store}
  template:
    metadata:
      labels: {app: session-store}
    spec:
      containers:
        - name: store
          image: nginx:1.27-alpine
          ports: [{containerPort: 80}]
          envFrom:
            - configMapRef: {name: session-store-conf}
EOF

# apply never removes an annotation it did not put there, so a restartedAt left
# by an earlier attempt would survive the reseed and hand the next candidate a
# question that is already answered.
kubectl -n sagitta patch deploy session-store --type=json \
  -p '[{"op": "remove", "path": "/spec/template/metadata/annotations/kubectl.kubernetes.io~1restartedAt"}]' \
  >/dev/null 2>&1 || true

kubectl -n sagitta rollout status deploy/session-store --timeout=180s
