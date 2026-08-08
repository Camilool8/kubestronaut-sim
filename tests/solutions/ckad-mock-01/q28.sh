#!/usr/bin/env bash
set -euo pipefail
kubectl -n equuleus create secret docker-registry registry-cred \
  --docker-server=registry:5000 \
  --docker-username=pipeline \
  --docker-password=s3cr3t-pull \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: puller
  namespace: equuleus
spec:
  imagePullSecrets:
    - name: registry-cred
  containers:
    - name: web
      image: nginx:1.29-alpine
EOF
kubectl -n equuleus wait --for=condition=Ready pod/puller --timeout=180s
