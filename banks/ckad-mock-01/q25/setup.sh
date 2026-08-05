#!/usr/bin/env bash
set -euo pipefail
kubectl create ns perseus --dry-run=client -o yaml | kubectl apply -f -

# The endpoint is bound to loopback on purpose. It is what makes the
# question about getting INSIDE the Pod rather than about reaching a
# Service: there is no Service, and there is nothing for one to select,
# because nginx is not listening on the Pod's address at all.
#
# The body lives in its own ConfigMap, served as a static file, so the
# check can read what the endpoint is meant to answer from the cluster
# instead of carrying a second copy of the string that would drift.
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
