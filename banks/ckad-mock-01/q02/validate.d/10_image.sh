#!/usr/bin/env bash
# points: 1
# desc: image is nginx:1.29-alpine
set -uo pipefail
img=$(kubectl -n nova get deploy nova-api -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].image}' 2>/dev/null)
[ "$img" = "nginx:1.29-alpine" ] && echo "image ok" || { echo "image is '$img'"; exit 1; }
