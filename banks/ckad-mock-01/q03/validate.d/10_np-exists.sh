#!/usr/bin/env bash
# points: 1
# desc: NetworkPolicy api-guard selects role=api and declares Ingress+Egress
# expected: networkpolicy.json json
set -uo pipefail
. /banks/_lib/checks.sh

snapshot() {
  kubectl -n orbit get netpol api-guard -o json 2>/dev/null \
    | jq -S '.spec | .policyTypes |= sort | .egress[]?.ports |= sort_by(.port, (.protocol // "TCP"))'
}

evidence() {
  show_pair json networkpolicy.json
  show_why "$1"
}

exists=$(kubectl -n orbit get netpol api-guard -o jsonpath='{.metadata.name}' 2>/dev/null)
[ -n "$exists" ] || {
  echo "NetworkPolicy api-guard not found in Namespace orbit"
  show_actual text "$(kubectl -n orbit get netpol 2>/dev/null)"
  show_why "Every part of this question is graded on a NetworkPolicy named api-guard in Namespace orbit, and the pane above lists what that Namespace actually holds. A policy created under another name, or in another Namespace, is invisible to every check here."
  exit 1
}

sel=$(kubectl -n orbit get netpol api-guard \
  -o jsonpath='{.spec.podSelector.matchLabels.role}' 2>/dev/null)
types=$(kubectl -n orbit get netpol api-guard -o json 2>/dev/null | jq -r '.spec.policyTypes[]?')

crit 1 "selects the role=api Pods" \
  "podSelector role is '$sel', want 'api'" \
  "spec.podSelector names the Pods the policy applies TO — the ones being protected — and it is matched inside the policy's own Namespace. An empty selector would select every Pod in orbit; one matching nothing leaves the api Pods with no policy at all, which means unrestricted rather than denied." \
  -- [ "$sel" = "api" ]

crit 1 "declares both Ingress and Egress" \
  "policyTypes are '$(printf '%s' "$types" | tr '\n' ' ')', want Ingress and Egress" \
  "policyTypes declares which directions this policy governs, and that is what makes 'everything else is denied' true: a direction listed here is denied except for the rules that allow it, and a direction NOT listed is left completely unrestricted no matter what rules are written below. Both directions have to appear for the question's last requirement to hold." \
  -- same_set "$types" "$(printf 'Ingress\nEgress')"

crit_all_passed || evidence "$(crit_why)"
report "selector+types ok"
