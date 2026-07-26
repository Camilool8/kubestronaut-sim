#!/usr/bin/env bash
set -euo pipefail
kubectl create ns lyra --dry-run=client -o yaml | kubectl apply -f -
# The dependency the init container waits for. It is a real, serving
# workload on purpose: an init container that waits for a *name* to
# resolve is the wrong pattern (a ClusterIP resolves whether or not
# anything is behind it), and busybox's nslookup exits non-zero whenever
# any search-domain attempt NXDOMAINs — so the obvious `until nslookup`
# loop never terminates even once the name works. Waiting until the
# dependency answers is both correct and what the pattern is actually for.
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
