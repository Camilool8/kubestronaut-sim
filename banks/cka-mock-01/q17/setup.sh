#!/usr/bin/env bash
set -euo pipefail
kubectl create ns gemini --dry-run=client -o yaml | kubectl apply -f -

# The Service is the candidate's to create, so nothing here declares it and an
# apply cannot take a previous attempt's answer away again. Delete it, or a
# re-seed hands the next attempt a question already solved. The Deployment
# needs no such treatment: its ports list is declared below, so the name the
# candidate adds to it goes when this applies.
kubectl -n gemini delete svc pollux-web --ignore-not-found >/dev/null

kubectl -n gemini apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: pollux-web-conf
  namespace: gemini
data:
  default.conf: |
    server {
      listen 8080;
      location / {
        add_header Content-Type text/plain;
        return 200 'pollux-ok\n';
      }
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pollux-web
  namespace: gemini
spec:
  replicas: 2
  selector:
    matchLabels: {app: pollux-web}
  template:
    metadata:
      labels: {app: pollux-web}
    spec:
      volumes:
        - name: conf
          configMap:
            name: pollux-web-conf
      containers:
        - name: web
          image: nginx:1.29-alpine
          ports:
            - containerPort: 8080
          volumeMounts:
            - name: conf
              mountPath: /etc/nginx/conf.d
EOF
kubectl -n gemini rollout status deploy/pollux-web --timeout=180s
