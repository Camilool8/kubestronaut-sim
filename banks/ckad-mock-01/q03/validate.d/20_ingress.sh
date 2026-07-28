#!/usr/bin/env bash
# points: 2
# desc: single ingress rule: from role=frontend pods, TCP 80 only
set -uo pipefail
. /banks/_lib/checks.sh
rules=$(kubectl -n orbit get netpol api-guard -o json 2>/dev/null | jq -c '.spec.ingress // []')

n=$(printf '%s' "$rules" | jq 'length')
[ "$n" = "1" ] || { echo "expected exactly 1 ingress rule, found ${n}"; exit 1; }

# Projected to a normalised set rather than read out of fixed [0]
# positions. The old form indexed .from[0] and .ports[0] directly, which
# only happened to be safe because the length assertions above pin every
# list to one element — the pattern does not survive a question that
# allows two peers or two ports.
peers=$(printf '%s' "$rules" | jq -r '[.[].from[]? | .podSelector.matchLabels | to_entries[] | "\(.key)=\(.value)"] | .[]')
same_set "$peers" "role=frontend" \
  || { echo "ingress peers are '$(printf '%s' "$peers" | tr '\n' ' ')', want role=frontend"; exit 1; }

# protocol defaults to TCP when omitted, and a candidate who left it out
# wrote a correct policy.
ports=$(printf '%s' "$rules" | jq -r '[.[].ports[]? | "\(.port)/\(.protocol // "TCP")"] | .[]')
same_set "$ports" "80/TCP" \
  || { echo "ingress ports are '$(printf '%s' "$ports" | tr '\n' ' ')', want 80/TCP"; exit 1; }

echo "ingress ok"
