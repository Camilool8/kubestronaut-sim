#!/usr/bin/env bash
set -euo pipefail
kubectl create ns reticulum --dry-run=client -o yaml | kubectl apply -f -

kubectl -n reticulum apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: ledger-conf
  namespace: reticulum
data:
  default.conf: |
    server {
      listen 80;
      location / {
        add_header Content-Type text/plain;
        return 200 'ledger-ok\n';
      }
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ledger
  namespace: reticulum
spec:
  replicas: 1
  selector:
    matchLabels: {role: ledger}
  template:
    metadata:
      labels: {role: ledger}
    spec:
      volumes:
        - name: conf
          configMap:
            name: ledger-conf
      containers:
        - name: web
          image: nginx:1.29-alpine
          ports: [{containerPort: 80}]
          volumeMounts:
            - name: conf
              mountPath: /etc/nginx/conf.d
EOF

for role in teller auditor; do
  kubectl -n reticulum apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: $role
  namespace: reticulum
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

# Both policies are the candidate's to write, and ones left behind by an earlier
# attempt would mean the Namespace starts closed instead of open.
kubectl -n reticulum delete netpol default-deny-ingress allow-teller \
  --ignore-not-found >/dev/null

kubectl -n reticulum rollout status deploy/ledger --timeout=180s
kubectl -n reticulum rollout status deploy/teller --timeout=180s
kubectl -n reticulum rollout status deploy/auditor --timeout=180s
