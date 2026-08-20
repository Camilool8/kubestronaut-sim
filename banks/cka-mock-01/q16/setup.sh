#!/usr/bin/env bash
set -euo pipefail
kubectl create ns hydra --dry-run=client -o yaml | kubectl apply -f -

# Three tiers, one image. api serves the application on 8080 and an admin
# endpoint on 9090 from the same container: the second port is what makes
# "only 8080" a thing the candidate can get wrong and a check can observe.
# No probes anywhere on purpose — a readiness gate here would grade the
# kubelet's own path to the Pod, which is not what this question is about.
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: api-conf
  namespace: hydra
data:
  default.conf: |
    server {
      listen 8080;
      location / {
        add_header Content-Type text/plain;
        return 200 'api-ok\n';
      }
    }
    server {
      listen 9090;
      location / {
        add_header Content-Type text/plain;
        return 200 'api-admin\n';
      }
    }
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: db-conf
  namespace: hydra
data:
  default.conf: |
    server {
      listen 5432;
      location / {
        add_header Content-Type text/plain;
        return 200 'db-ok\n';
      }
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: hydra
spec:
  replicas: 1
  selector:
    matchLabels: {tier: frontend}
  template:
    metadata:
      labels: {tier: frontend}
    spec:
      containers:
        - name: web
          image: nginx:1.29-alpine
          ports: [{containerPort: 80}]
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: hydra
spec:
  replicas: 1
  selector:
    matchLabels: {tier: api}
  template:
    metadata:
      labels: {tier: api}
    spec:
      volumes:
        - name: conf
          configMap:
            name: api-conf
      containers:
        - name: api
          image: nginx:1.29-alpine
          ports:
            - {containerPort: 8080, name: http}
            - {containerPort: 9090, name: admin}
          volumeMounts:
            - name: conf
              mountPath: /etc/nginx/conf.d
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: db
  namespace: hydra
spec:
  replicas: 1
  selector:
    matchLabels: {tier: db}
  template:
    metadata:
      labels: {tier: db}
    spec:
      volumes:
        - name: conf
          configMap:
            name: db-conf
      containers:
        - name: db
          image: nginx:1.29-alpine
          ports: [{containerPort: 5432, name: postgres}]
          volumeMounts:
            - name: conf
              mountPath: /etc/nginx/conf.d
---
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: hydra
spec:
  selector: {tier: api}
  ports:
    - name: http
      port: 8080
      targetPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: db
  namespace: hydra
spec:
  selector: {tier: db}
  ports:
    - name: postgres
      port: 5432
      targetPort: 5432
EOF

# The question opens on an unrestricted Namespace, and every policy in it is the
# candidate's to write — so a reset removes whatever an earlier attempt left,
# otherwise the Namespace would start half-closed and the first check would
# grade work nobody did this time. hydra belongs to this question alone, so
# --all reaches nothing else.
kubectl -n hydra delete netpol --all --ignore-not-found >/dev/null 2>&1 || true

kubectl -n hydra rollout status deploy/frontend --timeout=120s
kubectl -n hydra rollout status deploy/api --timeout=120s
kubectl -n hydra rollout status deploy/db --timeout=120s
