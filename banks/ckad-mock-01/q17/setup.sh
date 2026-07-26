#!/usr/bin/env bash
set -euo pipefail
kubectl create ns corvus --dry-run=client -o yaml | kubectl apply -f -
kubectl -n corvus apply -f - <<'EOF'
# Healthy: the control, so "delete everything that is not Running" is not
# a winning strategy.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: corvus
spec:
  replicas: 1
  selector:
    matchLabels: {app: frontend}
  template:
    metadata:
      labels: {app: frontend}
    spec:
      containers:
        - name: web
          image: nginx:1.29-alpine
---
# Broken 1: exits non-zero immediately, so it lands in CrashLoopBackOff
# and `logs --previous` is the only way to read why.
apiVersion: v1
kind: Pod
metadata:
  name: cache-worker
  namespace: corvus
  labels: {app: cache-worker}
spec:
  containers:
    - name: worker
      image: busybox:1.37
      command: ["sh", "-c", "echo 'FATAL: cache directory /var/cache/corvus is unavailable'; exit 1"]
---
# Broken 2: a tag that does not exist, so it never gets as far as
# starting a container — a different failure with a different diagnosis.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mailer
  namespace: corvus
spec:
  replicas: 1
  selector:
    matchLabels: {app: mailer}
  template:
    metadata:
      labels: {app: mailer}
    spec:
      containers:
        - name: mailer
          image: nginx:0.0.0-corvus-nonexistent
EOF
kubectl -n corvus rollout status deploy/frontend --timeout=180s
