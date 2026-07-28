#!/usr/bin/env bash
# points: 1
# desc: NetworkPolicy api-guard selects role=api and declares Ingress+Egress
set -uo pipefail
. /banks/_lib/checks.sh
sel=$(kubectl -n orbit get netpol api-guard \
  -o jsonpath='{.spec.podSelector.matchLabels.role}' 2>/dev/null)
[ "$sel" = "api" ] || { echo "podSelector role is '$sel', want 'api'"; exit 1; }

# policyTypes is a list, and the API preserves the order it was written
# in. This used to hand-enumerate both permutations of Ingress/Egress —
# correct for two values, and quietly wrong the moment a third exists.
# It also reported the whole thing as one opaque string, so a candidate
# who got the selector right and the types wrong could not tell.
types=$(kubectl -n orbit get netpol api-guard -o json 2>/dev/null | jq -r '.spec.policyTypes[]?')
same_set "$types" "$(printf 'Ingress\nEgress')" \
  && echo "selector+types ok" \
  || { echo "policyTypes are '$(printf '%s' "$types" | tr '\n' ' ')', want Ingress and Egress"; exit 1; }
