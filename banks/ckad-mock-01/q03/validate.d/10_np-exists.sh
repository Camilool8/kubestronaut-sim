#!/usr/bin/env bash
# points: 1
# desc: NetworkPolicy api-guard selects role=api and declares Ingress+Egress
set -uo pipefail
out=$(kubectl -n orbit get netpol api-guard \
  -o jsonpath='{.spec.podSelector.matchLabels.role} {.spec.policyTypes[*]}' 2>/dev/null)
{ [ "$out" = "api Ingress Egress" ] || [ "$out" = "api Egress Ingress" ]; } \
  && echo "selector+types ok" || { echo "got '$out'"; exit 1; }
