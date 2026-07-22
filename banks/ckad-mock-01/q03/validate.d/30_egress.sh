#!/usr/bin/env bash
# points: 2
# desc: egress allows only port 53 (UDP and TCP)
set -uo pipefail
eg=$(kubectl -n orbit get netpol api-guard -o jsonpath='{.spec.egress}' 2>/dev/null)
protos=$(echo "$eg" | jq -r '[.[].ports[] | "\(.port)/\(.protocol)"] | sort | join(",")')
[ "$protos" = "53/TCP,53/UDP" ] && echo "egress ok" || { echo "egress ports: '$protos'"; exit 1; }
