#!/usr/bin/env bash
set -euo pipefail
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: ledger
  namespace: cepheus
spec:
  clusterIP: None
  selector:
    app: ledger
  ports:
    - port: 80
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: ledger
  namespace: cepheus
spec:
  serviceName: ledger
  replicas: 2
  selector:
    matchLabels: {app: ledger}
  template:
    metadata:
      labels: {app: ledger}
    spec:
      containers:
        - name: ledger
          image: busybox:1.37
          command: ["sh", "-c", "sleep 86400"]
          volumeMounts:
            - name: data
              mountPath: /data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ReadWriteOnce]
        resources:
          requests:
            storage: 128Mi
EOF
kubectl -n cepheus rollout status statefulset ledger --timeout=300s

for p in ledger-0 ledger-1; do
  kubectl -n cepheus exec "$p" -- sh -c "echo $p > /data/owner"
done

kubectl -n cepheus get pvc -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' \
  > /opt/course/40/claims
