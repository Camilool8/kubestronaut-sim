#!/usr/bin/env bash
set -euo pipefail
cat > /opt/course/35/overlays/prod/kustomization.yaml <<'EOF'
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../base

patches:
  - patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: ledger-api
      spec:
        template:
          spec:
            containers:
              - name: api
                env:
                  - name: LEDGER_MODE
                    value: prod
                readinessProbe:
                  initialDelaySeconds: 5
EOF

kubectl kustomize /opt/course/35/overlays/prod >/dev/null
kubectl -n norma apply -k /opt/course/35/overlays/prod
kubectl -n norma rollout status deploy/ledger-api --timeout=180s
