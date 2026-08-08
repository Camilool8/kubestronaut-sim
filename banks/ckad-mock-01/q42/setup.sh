#!/usr/bin/env bash
set -euo pipefail
kubectl create ns antlia --dry-run=client -o yaml | kubectl apply -f -

# Four distinct replica counts, so the sort order the report asks for has
# exactly one correct answer and no ties to argue about.
kubectl -n antlia apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: search-indexer
  namespace: antlia
spec:
  replicas: 1
  selector:
    matchLabels: {app: search-indexer}
  template:
    metadata:
      labels: {app: search-indexer}
    spec:
      containers:
        - name: indexer
          image: busybox:1.37
          command: ["sh", "-c", "sleep 86400"]
          resources:
            requests: {memory: 16Mi, cpu: 10m}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: audit-writer
  namespace: antlia
spec:
  replicas: 2
  selector:
    matchLabels: {app: audit-writer}
  template:
    metadata:
      labels: {app: audit-writer}
    spec:
      containers:
        - name: writer
          image: busybox:1.37
          command: ["sh", "-c", "sleep 86400"]
          resources:
            requests: {memory: 16Mi, cpu: 10m}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: image-resizer
  namespace: antlia
spec:
  replicas: 3
  selector:
    matchLabels: {app: image-resizer}
  template:
    metadata:
      labels: {app: image-resizer}
    spec:
      containers:
        - name: resizer
          image: nginx:1.27-alpine
          resources:
            requests: {memory: 16Mi, cpu: 10m}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: billing-api
  namespace: antlia
spec:
  replicas: 4
  selector:
    matchLabels: {app: billing-api}
  template:
    metadata:
      labels: {app: billing-api}
    spec:
      containers:
        - name: api
          image: nginx:1.29-alpine
          resources:
            requests: {memory: 16Mi, cpu: 10m}
EOF

for d in search-indexer audit-writer image-resizer billing-api; do
  kubectl -n antlia rollout status "deploy/$d" --timeout=180s
done
