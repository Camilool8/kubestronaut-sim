#!/usr/bin/env bash
set -euo pipefail
kubectl create ns pyxis --dry-run=client -o yaml | kubectl apply -f -

# The question is answered by counting ReplicaSets, and a Deployment keeps one
# per template it has ever rolled out. Re-applying over an attempt would leave
# those behind and make the expected count wrong, so a reseed starts the history
# again from nothing.
kubectl -n pyxis delete deploy feed-api --ignore-not-found --cascade=foreground --wait >/dev/null

kubectl -n pyxis apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: feed-api
  namespace: pyxis
spec:
  replicas: 3
  selector:
    matchLabels: {app: feed-api}
  template:
    metadata:
      labels: {app: feed-api}
    spec:
      containers:
        - name: api
          image: nginx:1.27-alpine
          ports: [{containerPort: 80}]
EOF

kubectl -n pyxis rollout status deploy/feed-api --timeout=180s
