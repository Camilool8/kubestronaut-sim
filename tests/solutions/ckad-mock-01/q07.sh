#!/usr/bin/env bash
set -euo pipefail
kubectl -n cygnus apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: vault-agent
  namespace: cygnus
spec:
  containers:
    - name: agent
      image: busybox:1.37
      command: ["sh", "-c", "sleep 3600"]
      securityContext:
        runAsUser: 10001
        runAsGroup: 20001
        runAsNonRoot: true
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: ["ALL"]
      resources:
        requests:
          cpu: 100m
          memory: 64Mi
        limits:
          cpu: 500m
          memory: 128Mi
EOF
kubectl -n cygnus wait --for=condition=Ready pod/vault-agent --timeout=180s
