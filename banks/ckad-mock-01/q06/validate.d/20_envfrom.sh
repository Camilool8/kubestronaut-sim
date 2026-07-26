#!/usr/bin/env bash
# points: 3
# desc: Pod tuned takes every app-tuning entry via envFrom, not one by one
set -uo pipefail
ref=$(kubectl -n atlas get pod tuned \
  -o jsonpath='{.spec.containers[?(@.name=="web")].envFrom[*].configMapRef.name}' 2>/dev/null)
printf '%s' "$ref" | grep -qw app-tuning \
  || { echo "container 'web' has no envFrom for app-tuning (got '$ref')"; exit 1; }
echo "envFrom ok"
