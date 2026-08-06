#!/usr/bin/env bash
set -euo pipefail
kubectl create ns perseus --dry-run=client -o yaml | kubectl apply -f -

kubectl -n perseus apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: ledger-api-conf
  namespace: perseus
data:
  default.conf: |
    server {
        listen 127.0.0.1:8080;
        server_name localhost;
        root /usr/share/nginx/html;
        location / {
        }
    }
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ledger-api-page
  namespace: perseus
data:
  healthz: |
    ledger-api ok build 4471
---
apiVersion: v1
kind: Pod
metadata:
  name: ledger-api
  namespace: perseus
  labels:
    app: ledger-api
spec:
  containers:
    - name: api
      image: nginx:1.29-alpine
      volumeMounts:
        - name: conf
          mountPath: /etc/nginx/conf.d
        - name: page
          mountPath: /usr/share/nginx/html
  volumes:
    - name: conf
      configMap: {name: ledger-api-conf}
    - name: page
      configMap: {name: ledger-api-page}
EOF

kubectl -n perseus wait --for=condition=Ready pod/ledger-api --timeout=180s
