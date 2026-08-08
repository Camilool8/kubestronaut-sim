#!/usr/bin/env bash
set -euo pipefail
kubectl create ns telescopium --dry-run=client -o yaml | kubectl apply -f -

# $hostname is nginx's own variable, not the shell's: each Pod answers with the
# name the StatefulSet gave it, so a per-Pod DNS name can be told apart from the
# Service's.
kubectl -n telescopium apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: shard-conf
  namespace: telescopium
data:
  default.conf: |
    server {
      listen 80;
      location / {
        add_header Content-Type text/plain;
        return 200 '$hostname\n';
      }
    }
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: shard
  namespace: telescopium
spec:
  serviceName: shard
  replicas: 3
  selector:
    matchLabels: {app: shard}
  template:
    metadata:
      labels: {app: shard}
    spec:
      volumes:
        - name: conf
          configMap:
            name: shard-conf
      containers:
        - name: web
          image: nginx:1.29-alpine
          ports: [{containerPort: 80}]
          volumeMounts:
            - name: conf
              mountPath: /etc/nginx/conf.d
EOF

# The governing Service is the candidate's to create; one left behind by an
# earlier attempt would hand them the answer.
kubectl -n telescopium delete svc shard --ignore-not-found >/dev/null

kubectl -n telescopium rollout status statefulset/shard --timeout=300s
