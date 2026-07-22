#!/usr/bin/env bash
# points: 2
# desc: single ingress rule: from role=frontend pods, TCP 80 only
set -uo pipefail
rules=$(kubectl -n orbit get netpol api-guard -o jsonpath='{.spec.ingress}' 2>/dev/null)
n=$(echo "$rules" | jq 'length')
from=$(echo "$rules" | jq -r '.[0].from | length, .[0].from[0].podSelector.matchLabels.role')
ports=$(echo "$rules" | jq -r '.[0].ports | length, .[0].ports[0].port, (.[0].ports[0].protocol // "TCP")')
[ "$n" = "1" ] && [ "$from" = "1
frontend" ] && [ "$ports" = "1
80
TCP" ] && echo "ingress ok" || { echo "ingress rule wrong"; exit 1; }
