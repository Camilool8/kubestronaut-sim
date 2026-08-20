#!/usr/bin/env bash
set -euo pipefail
kubectl create ns dorado --dry-run=client -o yaml | kubectl apply -f -

# The backend answers with a word of its own so a reply through the Gateway
# proves which Service the route reached, rather than merely that something
# answered. It serves that word on every path: the question routes by host and
# nothing rewrites the path on the way through.
kubectl -n dorado apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: dorado-web-conf
  namespace: dorado
data:
  default.conf: |
    server {
      listen 8080;
      location / {
        add_header Content-Type text/plain;
        return 200 'dorado-ok\n';
      }
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dorado-web
  namespace: dorado
spec:
  replicas: 2
  selector:
    matchLabels: {app: dorado-web}
  template:
    metadata:
      labels: {app: dorado-web}
    spec:
      volumes:
        - name: conf
          configMap:
            name: dorado-web-conf
      containers:
        - name: web
          image: nginx:1.29-alpine
          ports: [{containerPort: 8080}]
          volumeMounts:
            - name: conf
              mountPath: /etc/nginx/conf.d
---
apiVersion: v1
kind: Service
metadata:
  name: dorado-web
  namespace: dorado
spec:
  selector: {app: dorado-web}
  ports:
    - port: 80
      targetPort: 8080
EOF

# The Gateway and the HTTPRoute are the candidate's entire answer, so a re-seed
# has to take a previous attempt's objects away again — otherwise the next
# attempt opens on a question already solved. Both are namespaced, so --all
# here reaches nothing another question seeded. Deleting the Gateway also
# removes the nginx data plane the controller provisioned for it, which is the
# only way to get this Namespace back to the state a fresh cluster starts in.
if kubectl get crd gateways.gateway.networking.k8s.io >/dev/null 2>&1; then
  kubectl -n dorado delete httproute --all --timeout=60s >/dev/null 2>&1 || true
  kubectl -n dorado delete gateway --all --timeout=60s >/dev/null 2>&1 || true
fi

# Not fatal: the addon is installed by the environment's bootstrap long before
# any question is seeded, and a question's setup is the wrong place to install
# a controller. Saying so in the seed log is what turns "the Gateway never went
# Programmed" from a mystery into a one-line diagnosis.
kubectl wait --for=condition=Accepted gatewayclass/sim --timeout=60s >/dev/null 2>&1 \
  || echo "warning: GatewayClass sim is not Accepted — the gateway-api addon may not be installed"

kubectl -n dorado rollout status deploy/dorado-web --timeout=180s
