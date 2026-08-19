#!/usr/bin/env bash
set -euo pipefail
kubectl create ns orion --dry-run=client -o yaml | kubectl apply -f -

# Two independent faults, seeded together on purpose: the image tag resolves in
# no registry, and the readinessProbe asks port 80 while the container serves
# 8080. The second is invisible until the first is fixed, because a Pod that
# never pulls never gets probed.
#
# Re-applying is the reset: apply overwrites both fields back to their broken
# values, so a candidate's repair is undone by a reset and left alone by a
# restart. Nothing here waits for a rollout — this Deployment is seeded so that
# it can never complete one.
kubectl -n orion apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: telemetry-conf
  namespace: orion
data:
  default.conf: |
    server {
      listen 8080;
      location / {
        add_header Content-Type text/plain;
        return 200 'telemetry\n';
      }
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: telemetry-api
  namespace: orion
spec:
  replicas: 3
  selector:
    matchLabels: {app: telemetry-api}
  template:
    metadata:
      labels: {app: telemetry-api}
    spec:
      volumes:
        - name: conf
          configMap:
            name: telemetry-conf
      containers:
        - name: api
          image: nginx:1.99
          ports:
            - name: http
              containerPort: 8080
          volumeMounts:
            - name: conf
              mountPath: /etc/nginx/conf.d
          readinessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 3
            periodSeconds: 5
            timeoutSeconds: 2
            failureThreshold: 3
EOF
