#!/usr/bin/env bash
set -euo pipefail
kubectl create ns sculptor --dry-run=client -o yaml | kubectl apply -f -

kubectl -n sculptor apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: portal-conf
  namespace: sculptor
data:
  default.conf: |
    server {
      listen 80;
      location / {
        add_header Content-Type text/plain;
        return 200 'portal-ok\n';
      }
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: portal
  namespace: sculptor
spec:
  replicas: 1
  selector:
    matchLabels: {app: portal}
  template:
    metadata:
      labels: {app: portal}
    spec:
      volumes:
        - name: conf
          configMap:
            name: portal-conf
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
  name: portal
  namespace: sculptor
spec:
  selector: {app: portal}
  ports:
    - port: 80
      targetPort: 80
EOF

# Both are the candidate's to create, and one left behind by an earlier attempt
# would score this question without them doing anything.
kubectl -n sculptor delete ingress portal-https --ignore-not-found >/dev/null
kubectl -n sculptor delete secret portal-tls --ignore-not-found >/dev/null

kubectl -n sculptor rollout status deploy/portal --timeout=180s
