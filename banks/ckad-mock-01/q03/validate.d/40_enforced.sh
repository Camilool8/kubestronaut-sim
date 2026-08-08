#!/usr/bin/env bash
# points: 4
# desc: the policy is actually enforced — frontend reaches api, metrics does not
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual yaml "$(kubectl -n orbit get netpol api-guard -o yaml 2>/dev/null | k8s_clean)"
  show_why "$1"
}

api=$(kubectl -n orbit get pod -l role=api \
  -o jsonpath='{.items[?(@.status.phase=="Running")].status.podIP}' 2>/dev/null | awk '{print $1}')
[ -n "$api" ] || {
  echo "no running api Pod to test against"
  show_actual text "$(kubectl -n orbit get pod --show-labels 2>/dev/null)"
  show_why "There is no Running Pod labelled role=api to send a request to, so the policy's effect cannot be observed either way. The three Deployments the question describes are seeded and were not yours to change."
  exit 1
}

reaches() {
  kubectl -n orbit exec "deploy/$1" -- \
    wget -q -T 5 -O /dev/null "http://${api}:80" 2>/dev/null
}

crit 2 "frontend still reaches api on port 80" \
  "frontend cannot reach api on port 80, but the policy should allow it" \
  "The policy is denying traffic it was supposed to permit. An ingress rule allows a source only if BOTH halves match — the peer's labels and the destination port — so a rule naming the wrong label, or restricted to the wrong port, denies frontend just as completely as no rule at all would." \
  -- reaches frontend

crit 3 "metrics is denied" \
  "metrics reached api on port 80 — ingress is not restricted to role=frontend" \
  "Everything that is not explicitly allowed has to be denied, and metrics got through. Either spec.podSelector matches no Pod — a policy that protects nothing is not a policy that allows everything, it simply never applies — or the ingress rule's peer selector is wider than role=frontend." \
  -- negate reaches metrics

crit_all_passed || evidence "$(crit_why)"
report "policy enforced: frontend allowed, metrics denied"
