#!/usr/bin/env bash
set -euo pipefail
kubectl create ns dorado --dry-run=client -o yaml | kubectl apply -f -
kubectl -n dorado apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: payments-backend-conf
  namespace: dorado
data:
  default.conf: |
    server {
      listen 80;
      location / {
        add_header Content-Type text/plain;
        return 200 'backend-ok\n';
      }
    }
---
# The ambassador's configuration is provided: the question is about the
# multi-container pattern, not about writing an nginx proxy block. Note
# it resolves the backend by Service name — that knowledge lives here,
# in the ambassador, and nowhere in the application.
apiVersion: v1
kind: ConfigMap
metadata:
  name: ambassador-conf
  namespace: dorado
data:
  default.conf: |
    server {
      listen 8080;
      location / {
        proxy_pass http://payments-backend.dorado.svc.cluster.local:80;
      }
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments-backend
  namespace: dorado
spec:
  replicas: 1
  selector:
    matchLabels: {app: payments-backend}
  template:
    metadata:
      labels: {app: payments-backend}
    spec:
      volumes:
        - name: conf
          configMap:
            name: payments-backend-conf
      containers:
        - name: web
          image: nginx:1.29-alpine
          ports: [{containerPort: 80}]
          volumeMounts:
            - name: conf
              mountPath: /etc/nginx/conf.d
---
apiVersion: v1
kind: Service
metadata:
  name: payments-backend
  namespace: dorado
spec:
  selector: {app: payments-backend}
  ports:
    - port: 80
      targetPort: 80
EOF
kubectl -n dorado rollout status deploy/payments-backend --timeout=180s
