#!/usr/bin/env bash
set -euo pipefail
kubectl create ns helios --dry-run=client -o yaml | kubectl apply -f -

for app in storefront checkout; do
  kubectl -n helios apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${app}-conf
  namespace: helios
data:
  default.conf: |
    server {
      listen 80;
      location / {
        add_header Content-Type text/plain;
        return 200 '${app}\n';
      }
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${app}
  namespace: helios
spec:
  replicas: 1
  selector:
    matchLabels: {app: ${app}}
  template:
    metadata:
      labels: {app: ${app}}
    spec:
      volumes:
        - name: conf
          configMap:
            name: ${app}-conf
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
  name: ${app}
  namespace: helios
spec:
  selector: {app: ${app}}
  ports:
    - port: 80
      targetPort: 80
EOF
done

kubectl -n helios rollout status deploy/storefront --timeout=180s
kubectl -n helios rollout status deploy/checkout --timeout=180s
