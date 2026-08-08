#!/usr/bin/env bash
set -euo pipefail
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: LimitRange
metadata:
  name: container-defaults
  namespace: fornax
spec:
  limits:
    - type: Container
      defaultRequest:
        cpu: 100m
        memory: 128Mi
      default:
        cpu: 500m
        memory: 256Mi
EOF

kubectl -n fornax delete pod unspecified --ignore-not-found >/dev/null
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: unspecified
  namespace: fornax
spec:
  containers:
    - name: app
      image: nginx:1.29-alpine
EOF
kubectl -n fornax wait --for=condition=Ready pod/unspecified --timeout=180s

kubectl -n fornax get pod unspecified \
  -o jsonpath='{.spec.containers[?(@.name=="app")].resources.requests.cpu}' \
  > /opt/course/27/cpu-request
