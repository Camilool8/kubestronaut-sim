#!/usr/bin/env bash
# points: 3
# desc: single ingress rule: from role=frontend pods, TCP 80 only
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual yaml "$(kubectl -n orbit get netpol api-guard -o yaml 2>/dev/null | k8s_clean)"
  show_expected yaml "/banks/${BANK:-ckad-mock-01}/q03/expected/networkpolicy.yaml"
  show_why "$1"
}

rules=$(kubectl -n orbit get netpol api-guard -o json 2>/dev/null | jq -c '.spec.ingress // []')

n=$(printf '%s' "$rules" | jq 'length')
peers=$(printf '%s' "$rules" | jq -r '[.[].from[]? | .podSelector.matchLabels | to_entries[] | "\(.key)=\(.value)"] | .[]')
ports=$(printf '%s' "$rules" | jq -r '[.[].ports[]? | "\(.port)/\(.protocol // "TCP")"] | .[]')

crit 1 "exactly one ingress rule" \
  "expected exactly 1 ingress rule, found ${n}" \
  "Ingress rules are additive: every rule in the list is a separate way in, so a second rule widens the policy rather than narrowing it. The question allows exactly one source on exactly one port, which is one rule." \
  -- [ "$n" = "1" ]

crit 1 "allows only role=frontend as the source" \
  "ingress peers are '$(printf '%s' "$peers" | tr '\n' ' ')', want role=frontend" \
  "A podSelector under 'from' selects the Pods allowed to connect, by label, inside this same Namespace — peers are never named, only labelled. An empty from list means every source is allowed, and a namespaceSelector beside it would widen the rule to other Namespaces instead of narrowing it." \
  -- same_set "$peers" "role=frontend"

crit 1 "restricted to TCP 80" \
  "ingress ports are '$(printf '%s' "$ports" | tr '\n' ' ')', want 80/TCP" \
  "The ports list restricts a rule to those destination ports on the selected Pods; omit it and the rule allows every port from that source. protocol defaults to TCP, so leaving it out is a correct answer — the number is what has to be 80." \
  -- same_set "$ports" "80/TCP"

crit_all_passed || evidence "$(crit_why)"
report "ingress ok"
