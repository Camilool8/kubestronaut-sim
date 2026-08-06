#!/usr/bin/env bash
set -euo pipefail
kubectl create ns tucana --dry-run=client -o yaml | kubectl apply -f -

kubectl -n tucana create secret generic ledger-creds \
  --from-literal=username=ledger \
  --from-literal=password=Qx7-plasma-42 \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n tucana apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ledger-api
  namespace: tucana
spec:
  replicas: 1
  selector:
    matchLabels: {app: ledger-api}
  template:
    metadata:
      labels: {app: ledger-api}
    spec:
      containers:
        - name: api
          image: nginx:1.29-alpine
          env:
            - name: DB_PASS
              valueFrom:
                secretKeyRef:
                  name: ledger-creds
                  key: DB_PASSWORD
EOF
