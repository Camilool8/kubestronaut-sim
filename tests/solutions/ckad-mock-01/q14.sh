#!/usr/bin/env bash
set -euo pipefail
kubectl -n tucana create secret generic api-keys \
  --from-literal=apikey=vega-7731 --from-literal=apisecret=RvT2-88x \
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
      volumes:
        - name: api-keys
          secret:
            secretName: api-keys
            defaultMode: 0400
      containers:
        - name: api
          image: nginx:1.29-alpine
          env:
            - name: DB_PASS
              valueFrom:
                secretKeyRef:
                  name: ledger-creds
                  key: password
          volumeMounts:
            - name: api-keys
              mountPath: /etc/api
              readOnly: true
EOF
kubectl -n tucana rollout status deploy/ledger-api --timeout=180s
kubectl -n tucana get secret ledger-creds -o jsonpath='{.data.password}' \
  | base64 -d > /opt/course/14/ledger-password
