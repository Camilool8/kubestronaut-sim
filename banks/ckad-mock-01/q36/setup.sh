#!/usr/bin/env bash
set -euo pipefail
for ns in mensa octans; do
  kubectl create ns "$ns" --dry-run=client -o yaml | kubectl apply -f -
done

kubectl -n mensa apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: catalog-conf
  namespace: mensa
data:
  default.conf: |
    server {
      listen 80;
      location / {
        add_header Content-Type text/plain;
        return 200 'catalog-mensa\n';
      }
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: catalog
  namespace: mensa
spec:
  replicas: 1
  selector:
    matchLabels: {app: catalog}
  template:
    metadata:
      labels: {app: catalog}
    spec:
      volumes:
        - name: conf
          configMap:
            name: catalog-conf
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
  name: catalog
  namespace: mensa
spec:
  selector: {app: catalog}
  ports:
    - port: 80
      targetPort: 80
EOF

kubectl -n octans apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shopfront
  namespace: octans
spec:
  replicas: 1
  selector:
    matchLabels: {app: shopfront}
  template:
    metadata:
      labels: {app: shopfront}
    spec:
      containers:
        - name: web
          image: nginx:1.29-alpine
          ports: [{containerPort: 80}]
EOF

# The alias is the candidate's to create; a leftover one from an earlier attempt
# would hand them the answer.
kubectl -n octans delete svc catalog --ignore-not-found >/dev/null

kubectl -n mensa rollout status deploy/catalog --timeout=180s
kubectl -n octans rollout status deploy/shopfront --timeout=180s
