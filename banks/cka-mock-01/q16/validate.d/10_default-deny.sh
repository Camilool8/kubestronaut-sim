#!/usr/bin/env bash
# points: 3
# desc: default-deny selects every Pod in hydra, governs both directions and allows nothing
set -uo pipefail
. /banks/_lib/checks.sh

evidence() {
  show_actual yaml "$(kubectl -n hydra get netpol default-deny -o yaml 2>/dev/null | k8s_clean)"
  show_why "$1"
}

pol=$(kubectl -n hydra get netpol default-deny -o json 2>/dev/null)
[ -n "$pol" ] || {
  echo "no NetworkPolicy named default-deny in Namespace hydra"
  show_actual text "$(kubectl -n hydra get netpol 2>/dev/null)"
  show_why "The Namespace has no default at all, so every Pod in it is still unrestricted and the two allow policies have nothing to be exceptions to. A Pod becomes deny-by-default in a direction only once some policy selects it and names that direction; with nothing selecting them, allowing frontend to reach api on 8080 changes nothing, because everything already could."
  exit 1
}

selects=$(printf '%s' "$pol" | jq '((.spec.podSelector.matchLabels // {}) | length)
                                 + ((.spec.podSelector.matchExpressions // []) | length)')
types=$(printf '%s' "$pol" | jq -r '.spec.policyTypes[]?')
in_rules=$(printf '%s' "$pol" | jq '(.spec.ingress // []) | length')
eg_rules=$(printf '%s' "$pol" | jq '(.spec.egress // []) | length')

allows_nothing() { [ "${in_rules:-x}" = "0" ] && [ "${eg_rules:-x}" = "0" ]; }

crit 1 "selects every Pod in the Namespace" \
  "podSelector narrows to ${selects:-?} condition(s), want an empty selector" \
  "An empty podSelector is the widest one there is: it selects every Pod in the policy's own Namespace, which is what makes this a default rather than a rule about one workload. Written as podSelector: {} it reads like nothing and means everything — and it is what puts db, which no other policy mentions, behind the deny." \
  -- [ "${selects:-x}" = "0" ]

crit 1 "governs both Ingress and Egress" \
  "policyTypes are '$(printf '%s' "$types" | tr '\n' ' ')', want Ingress and Egress" \
  "policyTypes is what flips the selected Pods from unrestricted to deny-by-default, and it does so per direction: a direction listed here is denied except for what some policy allows, and a direction left out is untouched no matter what appears below. Leaving Egress out would leave every Pod here free to open connections anywhere, so nothing would ever have to ask for DNS." \
  -- same_set "$types" "$(printf 'Ingress\nEgress')"

crit 1 "allows nothing itself" \
  "the policy carries ${in_rules:-?} ingress and ${eg_rules:-?} egress rule(s), want none of either" \
  "The deny is the ABSENCE of rules. An omitted ingress/egress key and an empty list both mean it, but a list holding one empty rule does not — that is a rule with no restriction on peer or port, which allows everything in that direction and is the usual way a default-deny ends up denying nothing. Put the allowances in their own policies, where they can be read, changed and deleted one at a time." \
  -- allows_nothing

crit_all_passed || evidence "$(crit_why)"
report "default-deny ok"
