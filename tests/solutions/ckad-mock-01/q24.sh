#!/usr/bin/env bash
set -euo pipefail
kubectl -n auriga apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: report-runner
  namespace: auriga
spec:
  replicas: 3
  selector:
    matchLabels:
      app: report-runner
  template:
    metadata:
      labels:
        app: report-runner
    spec:
      containers:
        - name: report
          image: busybox:1.37
          command: ["sh", "-c", "while true; do echo 'report-runner: nothing to do'; sleep 15; done"]
          securityContext:
            runAsUser: 1000
            runAsNonRoot: true
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
            seccompProfile:
              type: RuntimeDefault
EOF

kubectl -n auriga rollout status deploy/report-runner --timeout=180s
kubectl -n auriga delete pod report-runner --ignore-not-found
