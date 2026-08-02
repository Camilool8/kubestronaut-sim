#!/usr/bin/env bash
# points: 1
# desc: NetworkPolicy api-guard selects role=api and declares Ingress+Egress
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual yaml "$(kubectl -n orbit get netpol api-guard -o yaml 2>/dev/null | k8s_clean)"
  show_expected yaml "/banks/${BANK:-ckad-mock-01}/q03/expected/networkpolicy.yaml"
  show_why "$1"
}

sel=$(kubectl -n orbit get netpol api-guard \
  -o jsonpath='{.spec.podSelector.matchLabels.role}' 2>/dev/null)
[ "$sel" = "api" ] || {
  echo "podSelector role is '$sel', want 'api'"
  evidence "spec.podSelector names the Pods the policy applies TO — the ones being protected — and it is matched inside the policy's own Namespace. An empty selector would select every Pod in orbit; one matching nothing leaves the api Pods with no policy at all, which means unrestricted rather than denied."
  exit 1
}

# policyTypes is a list, and the API preserves the order it was written
# in. This used to hand-enumerate both permutations of Ingress/Egress —
# correct for two values, and quietly wrong the moment a third exists.
# It also reported the whole thing as one opaque string, so a candidate
# who got the selector right and the types wrong could not tell.
types=$(kubectl -n orbit get netpol api-guard -o json 2>/dev/null | jq -r '.spec.policyTypes[]?')
same_set "$types" "$(printf 'Ingress\nEgress')" && echo "selector+types ok" || {
  echo "policyTypes are '$(printf '%s' "$types" | tr '\n' ' ')', want Ingress and Egress"
  evidence "policyTypes declares which directions this policy governs, and that is what makes 'everything else is denied' true: a direction listed here is denied except for the rules that allow it, and a direction NOT listed is left completely unrestricted no matter what rules are written below. Both directions have to appear for the question's last requirement to hold."
  exit 1
}
