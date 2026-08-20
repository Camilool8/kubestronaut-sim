#!/usr/bin/env bash
set -euo pipefail
kubectl create ns horologium --dry-run=client -o yaml | kubectl apply -f -

# One fault only: the probe is aimed at 8080 and the container serves on 80.
# The timings are deliberately unhurried — a 5s delay and two failures at 3s
# apart — so that correcting the port alone is enough for the container to pass
# on its first attempt and never restart again. A tighter budget here would
# make a correct answer look wrong on a slow node.
kubectl -n horologium apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: session-store
  namespace: horologium
spec:
  replicas: 2
  selector:
    matchLabels: {app: session-store}
  template:
    metadata:
      labels: {app: session-store}
    spec:
      containers:
        - name: store
          image: nginx:1.29-alpine
          ports: [{containerPort: 80}]
          resources:
            requests: {memory: 24Mi, cpu: 10m}
          livenessProbe:
            httpGet:
              path: /
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 3
            failureThreshold: 2
EOF

# Hand the candidate a Namespace whose restart counts are already climbing,
# rather than one that looks healthy for the first quarter minute. Bounded, and
# never fatal: the first kill lands around 11s and the loop gives up at 45s.
for _ in $(seq 1 15); do
  restarts=$(kubectl -n horologium get pod -l app=session-store \
    -o jsonpath='{.items[*].status.containerStatuses[*].restartCount}' 2>/dev/null \
    | tr ' ' '\n' | sort -n | tail -1) || restarts=0
  if [ "${restarts:-0}" -ge 1 ] 2>/dev/null; then break; fi
  sleep 3
done
