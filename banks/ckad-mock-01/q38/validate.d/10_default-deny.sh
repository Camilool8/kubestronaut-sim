#!/usr/bin/env bash
# points: 2
# desc: default-deny-ingress selects every Pod in reticulum, governs ingress and allows nothing
# expected: default-deny.json json
set -uo pipefail
. /banks/_lib/checks.sh

snapshot() {
  printf '%s' "${pol:-null}" | jq -S '{
    podSelector: (.spec.podSelector // {}),
    policyTypes: ((.spec.policyTypes // []) | sort),
    ingress: (.spec.ingress // [])
  }' 2>/dev/null
}

evidence() {
  show_pair json default-deny.json
  show_why "$1"
}

kubectl -n reticulum get netpol default-deny-ingress >/dev/null 2>&1 || {
  echo "no NetworkPolicy named default-deny-ingress in Namespace reticulum"
  show_actual text "$(kubectl -n reticulum get netpol 2>/dev/null)"
  show_why "The Namespace has no default at all, so every Pod in it is still unrestricted. A Pod becomes deny-by-default in a direction only once some policy selects it and names that direction; with nothing selecting them, the second policy's allowance is meaningless because nothing was ever denied."
  exit 1
}

pol=$(kubectl -n reticulum get netpol default-deny-ingress -o json 2>/dev/null)
selects=$(printf '%s' "$pol" | jq '((.spec.podSelector.matchLabels // {}) | length)
                                 + ((.spec.podSelector.matchExpressions // []) | length)')
types=$(printf '%s' "$pol" | jq -r '.spec.policyTypes[]?')
rules=$(printf '%s' "$pol" | jq '(.spec.ingress // []) | length')

crit 2 "selects every Pod in the Namespace" \
  "podSelector narrows to $selects condition(s), want an empty selector" \
  "An empty podSelector is the widest one there is: it selects every Pod in the policy's own Namespace, which is what makes this a default rather than a rule about one workload. Written as podSelector: {} it reads like nothing and means everything." \
  -- [ "$selects" = "0" ]

crit 1 "governs ingress only" \
  "policyTypes are '$(printf '%s' "$types" | tr '\n' ' ')', want Ingress alone" \
  "policyTypes is what flips the selected Pods from unrestricted to deny-by-default, and it does so per direction: a direction listed here is denied except for what the rules allow, and a direction left out is untouched no matter what appears below. Adding Egress here would also cut off DNS for every Pod in the Namespace, which the question rules out." \
  -- same_set "$types" "Ingress"

crit 1 "allows nothing itself" \
  "the policy carries $rules ingress rule(s), want none" \
  "The deny is the ABSENCE of rules. An omitted ingress key and an empty list both mean it, but a list holding one empty rule does not — that is a rule with no restrictions on peer or port, which allows everything from everywhere and is the usual way a default-deny ends up denying nothing." \
  -- [ "$rules" = "0" ]

crit_all_passed || evidence "$(crit_why)"
report "default-deny ok"
