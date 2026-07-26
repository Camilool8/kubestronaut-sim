#!/usr/bin/env bash
# points: 2
# desc: rollingUpdate maxSurge=1 maxUnavailable=0
set -uo pipefail
out=$(kubectl -n nova get deploy nova-api -o jsonpath='{.spec.strategy.rollingUpdate.maxSurge} {.spec.strategy.rollingUpdate.maxUnavailable}' 2>/dev/null)
[ "$out" = "1 0" ] && echo "strategy ok" || { echo "strategy: '$out'"; exit 1; }
