#!/usr/bin/env bash
set -euo pipefail
cat > /opt/course/34/cache-values.yaml <<'EOF'
replicaCount: 3
image:
  tag: 1.27-alpine
EOF

helm -n caelum upgrade --install object-cache sim/sim-cache \
  -f /opt/course/34/cache-values.yaml --wait --timeout 3m

kubectl -n caelum rollout status deploy/object-cache --timeout=180s
