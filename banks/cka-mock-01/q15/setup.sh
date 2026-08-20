#!/usr/bin/env bash
set -euo pipefail
kubectl create ns lacerta --dry-run=client -o yaml | kubectl apply -f -

# The Gateway and the HTTPRoute are the candidate's whole answer. Ones left
# behind by an earlier attempt would score most of this question before they
# started, so they go here rather than being applied. Guarded on the CRDs
# because a bank without the gateway-api addon has no such kinds at all, and a
# seed must not die on the absence of the thing it is deleting.
if kubectl get crd httproutes.gateway.networking.k8s.io >/dev/null 2>&1; then
  kubectl -n lacerta delete httproute lacerta-routes --ignore-not-found >/dev/null
fi
if kubectl get crd gateways.gateway.networking.k8s.io >/dev/null 2>&1; then
  kubectl -n lacerta delete gateway lacerta-gateway --ignore-not-found >/dev/null
fi

# One self-signed certificate for the host, minted only when the Secret is
# absent. A re-seed must not hand the cluster a NEW certificate: the
# candidate's listener references this Secret by name, and rotating what it
# serves halfway through an attempt would break a correct answer for reasons
# nothing on screen could explain. openssl ships in this image (Alpine's
# openssl 3.x), so nothing is fetched and nothing is stored in the repo.
if ! kubectl -n lacerta get secret lacerta-tls >/dev/null 2>&1; then
  certdir=$(mktemp -d)
  openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
    -subj "/CN=q15-lacerta.sim.local/O=sim" \
    -addext "subjectAltName=DNS:q15-lacerta.sim.local" \
    -keyout "${certdir}/tls.key" -out "${certdir}/tls.crt" >/dev/null 2>&1
  kubectl -n lacerta create secret tls lacerta-tls \
    --cert="${certdir}/tls.crt" --key="${certdir}/tls.key" \
    --dry-run=client -o json | kubectl apply -f -
  rm -rf "${certdir}"
fi

# Two backends that answer with a word of their own, so a request that arrives
# says which one it reached. Each answers on every path, because neither an
# Ingress prefix nor an HTTPRoute PathPrefix match rewrites what it forwards:
# /store arrives at storefront as /store, not as /.
kubectl -n lacerta apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: storefront-conf
  namespace: lacerta
data:
  default.conf: |
    server {
      listen 80;
      location / {
        add_header Content-Type text/plain;
        return 200 'storefront-ok\n';
      }
    }
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: checkout-conf
  namespace: lacerta
data:
  default.conf: |
    server {
      listen 8080;
      location / {
        add_header Content-Type text/plain;
        return 200 'checkout-ok\n';
      }
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: storefront
  namespace: lacerta
spec:
  replicas: 1
  selector:
    matchLabels: {app: storefront}
  template:
    metadata:
      labels: {app: storefront}
    spec:
      volumes:
        - name: conf
          configMap:
            name: storefront-conf
      containers:
        - name: storefront
          image: nginx:1.29-alpine
          ports: [{containerPort: 80}]
          volumeMounts:
            - name: conf
              mountPath: /etc/nginx/conf.d
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout
  namespace: lacerta
spec:
  replicas: 1
  selector:
    matchLabels: {app: checkout}
  template:
    metadata:
      labels: {app: checkout}
    spec:
      volumes:
        - name: conf
          configMap:
            name: checkout-conf
      containers:
        - name: checkout
          image: nginx:1.29-alpine
          ports: [{containerPort: 8080}]
          volumeMounts:
            - name: conf
              mountPath: /etc/nginx/conf.d
---
apiVersion: v1
kind: Service
metadata:
  name: storefront
  namespace: lacerta
spec:
  selector: {app: storefront}
  ports:
    - port: 80
      targetPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: checkout
  namespace: lacerta
spec:
  selector: {app: checkout}
  ports:
    - port: 8080
      targetPort: 8080
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: lacerta-legacy
  namespace: lacerta
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - q15-lacerta.sim.local
      secretName: lacerta-tls
  rules:
    - host: q15-lacerta.sim.local
      http:
        paths:
          - path: /store
            pathType: Prefix
            backend:
              service:
                name: storefront
                port:
                  number: 80
          - path: /checkout
            pathType: Prefix
            backend:
              service:
                name: checkout
                port:
                  number: 8080
EOF

kubectl -n lacerta rollout status deploy/storefront --timeout=180s
kubectl -n lacerta rollout status deploy/checkout --timeout=180s
