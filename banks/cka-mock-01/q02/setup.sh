#!/usr/bin/env bash
set -euo pipefail
kubectl create ns lyra --dry-run=client -o yaml | kubectl apply -f -

# The ConfigMap holds the endpoint under DB_ENDPOINT. The Deployment asks for
# a key named db-endpoint, which does not exist — and asks for it with
# optional: true, which is what makes this a crash loop rather than a
# CreateContainerConfigError: the kubelet starts the container with the
# variable simply unset, and the process itself refuses to run without it.
kubectl -n lyra apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: payments-config
  namespace: lyra
data:
  DB_ENDPOINT: postgres.lyra.svc.cluster.local:5432
  LOG_LEVEL: info
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments-api
  namespace: lyra
spec:
  replicas: 1
  selector:
    matchLabels: {app: payments-api}
  template:
    metadata:
      labels: {app: payments-api}
    spec:
      containers:
        - name: api
          image: busybox:1.37
          env:
            - name: LOG_LEVEL
              valueFrom:
                configMapKeyRef:
                  name: payments-config
                  key: LOG_LEVEL
            - name: DB_ENDPOINT
              valueFrom:
                configMapKeyRef:
                  name: payments-config
                  key: db-endpoint
                  optional: true
          command: ["sh", "-c"]
          args:
            - |
              if [ -z "${DB_ENDPOINT:-}" ]; then
                echo "FATAL: DB_ENDPOINT is empty - payments-api has no database endpoint to connect to"
                exit 1
              fi
              echo "payments-api starting at log level ${LOG_LEVEL:-info}, database ${DB_ENDPOINT}"
              while true; do sleep 3600; done
EOF
