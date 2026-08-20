#!/usr/bin/env bash
set -euo pipefail
kubectl create ns draco --dry-run=client -o yaml | kubectl apply -f -

kubectl -n draco apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: nova-api-conf
  namespace: draco
data:
  default.conf: |
    server {
      listen 8080;
      location / {
        add_header Content-Type text/plain;
        return 200 'nova-api\n';
      }
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nova-api
  namespace: draco
spec:
  replicas: 2
  selector:
    matchLabels: {app: nova-api}
  template:
    metadata:
      labels: {app: nova-api}
    spec:
      volumes:
        - name: conf
          configMap:
            name: nova-api-conf
      containers:
        - name: api
          image: nginx:1.29-alpine
          ports:
            - name: http-api
              containerPort: 8080
          volumeMounts:
            - name: conf
              mountPath: /etc/nginx/conf.d
---
apiVersion: v1
kind: Service
metadata:
  name: nova-api
  namespace: draco
spec:
  selector: {app: nova-api-prod}
  ports:
    - port: 80
      targetPort: http-aip
EOF
kubectl -n draco rollout status deploy/nova-api --timeout=180s
