#!/usr/bin/env bash
set -euo pipefail
kubectl create ns lupus --dry-run=client -o yaml | kubectl apply -f -

# The canary is the candidate's to create, so re-seeding has to take it away
# again or the Service starts the question with six endpoints behind it.
kubectl -n lupus delete deploy search-canary --ignore-not-found >/dev/null

# The Service selects on app=search alone. That is what makes a canary possible
# here at all: a second Deployment carrying the same app label joins the same
# endpoint list without the Service being touched.
kubectl -n lupus apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: search-stable
  namespace: lupus
spec:
  replicas: 5
  selector:
    matchLabels: {app: search, track: stable}
  template:
    metadata:
      labels: {app: search, track: stable}
    spec:
      containers:
        - name: web
          image: nginx:1.27-alpine
          ports: [{containerPort: 80}]
---
apiVersion: v1
kind: Service
metadata:
  name: search
  namespace: lupus
spec:
  selector: {app: search}
  ports: [{port: 80, targetPort: 80, protocol: TCP}]
EOF

kubectl -n lupus rollout status deploy/search-stable --timeout=180s
