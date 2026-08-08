#!/usr/bin/env bash
# points: 3
# desc: allow-teller opens exactly one path — role=teller to role=ledger on TCP 80
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual yaml "$(kubectl -n reticulum get netpol allow-teller -o yaml 2>/dev/null | k8s_clean)"
  show_why "$1"
}

kubectl -n reticulum get netpol allow-teller >/dev/null 2>&1 || {
  echo "no NetworkPolicy named allow-teller in Namespace reticulum"
  show_actual text "$(kubectl -n reticulum get netpol 2>/dev/null)"
  show_why "Nothing reopens a path through the default. There is no deny rule in this API and no precedence between policies: a Pod permits the union of what every policy selecting it allows, so the exception has to be its own object contributing that one allowance."
  exit 1
}

pol=$(kubectl -n reticulum get netpol allow-teller -o json 2>/dev/null)
sel=$(printf '%s' "$pol" | jq -r '.spec.podSelector.matchLabels // {} | to_entries | map("\(.key)=\(.value)") | sort | join(",")')
n=$(printf '%s' "$pol" | jq '(.spec.ingress // []) | length')
peers=$(printf '%s' "$pol" | jq -r '[.spec.ingress[]?.from[]? | .podSelector.matchLabels // {} | to_entries[] | "\(.key)=\(.value)"] | .[]')
wider=$(printf '%s' "$pol" | jq '[.spec.ingress[]?.from[]? | select(has("namespaceSelector") or has("ipBlock"))] | length')
ports=$(printf '%s' "$pol" | jq -r '[.spec.ingress[]?.ports[]? | "\(.port)/\(.protocol // "TCP")"] | .[]')

only_teller() { same_set "$peers" "role=teller" && [ "$wider" = "0" ]; }

crit 1 "protects the ledger Pods" \
  "podSelector is '$sel', want role=ledger" \
  "spec.podSelector names the Pods the policy applies TO — the destination being protected — matched inside the policy's own Namespace. Naming the source here instead is the classic swap: it would leave the ledger Pods with no allowance at all, which the default-deny then makes total." \
  -- [ "$sel" = "role=ledger" ]

crit 1 "exactly one ingress rule" \
  "the policy carries $n ingress rule(s), want 1" \
  "Ingress rules are additive: each entry is a separate way in, so a second rule widens the opening rather than narrowing it. One source on one port is one rule." \
  -- [ "$n" = "1" ]

crit 1 "only the teller Pods may connect" \
  "ingress peers are '$(printf '%s' "$peers" | tr '\n' ' ')', want role=teller alone" \
  "A podSelector under 'from' picks the Pods allowed to connect, by label, inside this same Namespace — peers are never named, only labelled. An empty from list allows every source, and a namespaceSelector or ipBlock beside it widens the rule to other Namespaces or to raw addresses instead of narrowing it." \
  -- only_teller

crit 1 "only on TCP 80" \
  "ingress ports are '$(printf '%s' "$ports" | tr '\n' ' ')', want 80/TCP" \
  "The ports list restricts a rule to those destination ports on the selected Pods; leave it out and the rule opens every port to that source. protocol defaults to TCP, so omitting it is a correct answer — the number is what has to be 80." \
  -- same_set "$ports" "80/TCP"

crit_all_passed || evidence "$(crit_why)"
report "allow rule ok"
