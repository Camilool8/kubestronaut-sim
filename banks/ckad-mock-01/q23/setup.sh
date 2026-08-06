#!/usr/bin/env bash
set -euo pipefail
kubectl create ns lacerta --dry-run=client -o yaml | kubectl apply -f -

kubectl -n lacerta apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: checkout-blue-page
  namespace: lacerta
data:
  index.html: |
    checkout release blue
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: checkout-green-page
  namespace: lacerta
data:
  index.html: |
    checkout release green
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-blue
  namespace: lacerta
spec:
  replicas: 2
  selector:
    matchLabels: {app: checkout, release: blue}
  template:
    metadata:
      labels: {app: checkout, release: blue}
    spec:
      containers:
        - name: web
          image: nginx:1.27-alpine
          ports: [{containerPort: 80}]
          volumeMounts:
            - name: page
              mountPath: /usr/share/nginx/html
      volumes:
        - name: page
          configMap: {name: checkout-blue-page}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-green
  namespace: lacerta
spec:
  replicas: 2
  selector:
    matchLabels: {app: checkout, release: green}
  template:
    metadata:
      labels: {app: checkout, release: green}
    spec:
      containers:
        - name: web
          image: nginx:1.29-alpine
          ports: [{containerPort: 80}]
          volumeMounts:
            - name: page
              mountPath: /usr/share/nginx/html
      volumes:
        - name: page
          configMap: {name: checkout-green-page}
---
apiVersion: v1
kind: Service
metadata:
  name: checkout
  namespace: lacerta
spec:
  selector: {app: checkout, release: blue}
  ports: [{port: 80, targetPort: 80, protocol: TCP}]
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-client
  namespace: lacerta
spec:
  replicas: 1
  selector:
    matchLabels: {app: checkout-client}
  template:
    metadata:
      labels: {app: checkout-client}
    spec:
      containers:
        - name: client
          image: busybox:1.37
          command: ["sh", "-c", "while true; do sleep 30; done"]
EOF

kubectl -n lacerta rollout status deploy/checkout-blue --timeout=180s
kubectl -n lacerta rollout status deploy/checkout-green --timeout=180s
kubectl -n lacerta rollout status deploy/checkout-client --timeout=180s
