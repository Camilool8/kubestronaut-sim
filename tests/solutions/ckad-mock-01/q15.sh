#!/usr/bin/env bash
set -euo pipefail
kubectl -n phoenix create serviceaccount pipeline-runner \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n phoenix apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pipeline
  namespace: phoenix
spec:
  replicas: 1
  selector:
    matchLabels: {app: pipeline}
  template:
    metadata:
      labels: {app: pipeline}
    spec:
      serviceAccountName: pipeline-runner
      containers:
        - name: runner
          image: nginx:1.29-alpine
---
apiVersion: v1
kind: Pod
metadata:
  name: no-token
  namespace: phoenix
spec:
  automountServiceAccountToken: false
  containers:
    - name: web
      image: nginx:1.29-alpine
EOF
kubectl -n phoenix rollout status deploy/pipeline --timeout=180s
kubectl -n phoenix wait --for=condition=Ready pod/no-token --timeout=180s
kubectl -n phoenix create token pipeline-runner --duration=1h > /opt/course/15/pipeline-token
