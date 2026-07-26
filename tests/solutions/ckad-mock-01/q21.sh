#!/usr/bin/env bash
set -euo pipefail
kubectl -n pictor apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: telemetry
  namespace: pictor
spec:
  volumes:
    - name: telemetry
      emptyDir: {}
  containers:
    - name: app
      image: busybox:1.37
      command:
        - sh
        - -c
        - while true; do echo 'cpu=42;mem=71' > /var/run/telemetry/raw.log; sleep 2; done
      volumeMounts:
        - name: telemetry
          mountPath: /var/run/telemetry
    - name: adapter
      image: busybox:1.37
      command:
        - sh
        - -c
        - while true; do tr ';' '\n' < /var/run/telemetry/raw.log | tr '=' ' ' > /var/run/telemetry/metrics.prom; sleep 2; done
      volumeMounts:
        - name: telemetry
          mountPath: /var/run/telemetry
EOF
kubectl -n pictor wait --for=condition=Ready pod/telemetry --timeout=180s
# Let both loops tick at least once before anything reads metrics.prom.
sleep 6
