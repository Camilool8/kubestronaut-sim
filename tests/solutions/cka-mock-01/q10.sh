#!/usr/bin/env bash
set -euo pipefail
cat > /opt/course/10/overlays/prod/kustomization.yaml <<'EOF'
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: scutum
resources:
  - ../../base

images:
  - name: nginx
    newTag: 1.29-alpine

replicas:
  - name: helios-web
    count: 3

labels:
  - pairs:
      env: prod
    includeSelectors: false
    includeTemplates: true
EOF
kubectl apply -k /opt/course/10/overlays/prod
kubectl -n scutum rollout status deploy/helios-web --timeout=180s
