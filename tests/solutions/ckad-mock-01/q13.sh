#!/usr/bin/env bash
set -euo pipefail
cat > /opt/course/13/overlays/staging/kustomization.yaml <<'EOF'
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../base

namePrefix: staging-

labels:
  - pairs:
      tier: staging
    includeSelectors: false

images:
  - name: nginx
    newTag: 1.29-alpine

replicas:
  - name: cargo-api
    count: 3
EOF
kubectl -n pavo apply -k /opt/course/13/overlays/staging
kubectl -n pavo rollout status deploy/staging-cargo-api --timeout=180s
