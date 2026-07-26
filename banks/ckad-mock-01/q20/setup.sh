#!/usr/bin/env bash
set -euo pipefail
kubectl create ns aquila --dry-run=client -o yaml | kubectl apply -f -
kubectl -n aquila apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: status-page-conf
  namespace: aquila
data:
  default.conf: |
    server {
      listen 80;
      location / {
        add_header Content-Type text/plain;
        return 200 'status-ok\n';
      }
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: status-page
  namespace: aquila
spec:
  replicas: 2
  selector:
    matchLabels: {app: status-page}
  template:
    metadata:
      labels: {app: status-page}
    spec:
      volumes:
        - name: conf
          configMap:
            name: status-page-conf
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
  name: status-page
  namespace: aquila
spec:
  type: ClusterIP
  selector: {app: status-page}
  ports:
    - port: 80
      targetPort: 80
EOF
kubectl -n aquila rollout status deploy/status-page --timeout=180s
