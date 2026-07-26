#!/usr/bin/env bash
# points: 4
# desc: ResourceQuota staging-quota limits pods=5 and requests.cpu=1
set -uo pipefail
out=$(kubectl -n aurora-staging get quota staging-quota \
  -o jsonpath='{.spec.hard.pods} {.spec.hard.requests\.cpu}' 2>/dev/null)
[ "$out" = "5 1" ] && echo "quota ok" || { echo "quota wrong or missing (got: '$out')"; exit 1; }
