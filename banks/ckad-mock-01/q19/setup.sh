#!/usr/bin/env bash
set -euo pipefail
kubectl create ns serpens --dry-run=client -o yaml | kubectl apply -f -

# The app listens on 8080, not 80, and its Pods carry app=inventory. The
# Service gets both wrong: a selector that matches nothing (so it has no
# endpoints at all) and a targetPort that would hit a closed port even if
# the selector were right. Two faults on purpose — fixing only the
# selector produces endpoints and still no answer, which is the more
# instructive half of the exercise.
kubectl -n serpens apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: inventory-conf
  namespace: serpens
data:
  default.conf: |
    server {
      listen 8080;
      location / {
        add_header Content-Type text/plain;
        return 200 'inventory\n';
      }
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: inventory
  namespace: serpens
spec:
  replicas: 2
  selector:
    matchLabels: {app: inventory}
  template:
    metadata:
      labels: {app: inventory}
    spec:
      volumes:
        - name: conf
          configMap:
            name: inventory-conf
      containers:
        - name: api
          image: nginx:1.29-alpine
          ports: [{containerPort: 8080}]
          volumeMounts:
            - name: conf
              mountPath: /etc/nginx/conf.d
---
apiVersion: v1
kind: Service
metadata:
  name: inventory
  namespace: serpens
spec:
  selector: {app: inventory-api}
  ports:
    - port: 80
      targetPort: 80
EOF
kubectl -n serpens rollout status deploy/inventory --timeout=180s
