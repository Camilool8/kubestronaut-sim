#!/usr/bin/env bash
set -euo pipefail
kubectl create ns phoenix --dry-run=client -o yaml | kubectl apply -f -

# Two backends that answer with a word of their own, so a request through the
# controller says which one it reached. Each serves that word on every path,
# because ingress-nginx forwards the request path unchanged: /api arrives at
# the api backend as /api, not as /.
kubectl -n phoenix apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: api-conf
  namespace: phoenix
data:
  default.conf: |
    server {
      listen 8080;
      location / {
        add_header Content-Type text/plain;
        return 200 'api-ok\n';
      }
    }
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-conf
  namespace: phoenix
data:
  default.conf: |
    server {
      listen 80;
      location / {
        add_header Content-Type text/plain;
        return 200 'web-ok\n';
      }
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: phoenix
spec:
  replicas: 1
  selector:
    matchLabels: {app: api}
  template:
    metadata:
      labels: {app: api}
    spec:
      volumes:
        - name: conf
          configMap:
            name: api-conf
      containers:
        - name: api
          image: nginx:1.29-alpine
          ports: [{containerPort: 8080}]
          volumeMounts:
            - name: conf
              mountPath: /etc/nginx/conf.d
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: phoenix
spec:
  replicas: 1
  selector:
    matchLabels: {app: web}
  template:
    metadata:
      labels: {app: web}
    spec:
      volumes:
        - name: conf
          configMap:
            name: web-conf
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
  name: api
  namespace: phoenix
spec:
  selector: {app: api}
  ports:
    - port: 8080
      targetPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: phoenix
spec:
  selector: {app: web}
  ports:
    - port: 80
      targetPort: 80
EOF

# The Ingress is the candidate's whole answer, and one left behind by an earlier
# attempt would score this question without them doing anything.
kubectl -n phoenix delete ingress phoenix-routes --ignore-not-found >/dev/null

kubectl -n phoenix rollout status deploy/api --timeout=180s
kubectl -n phoenix rollout status deploy/web --timeout=180s
