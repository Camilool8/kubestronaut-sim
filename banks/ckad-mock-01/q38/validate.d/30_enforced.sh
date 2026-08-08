#!/usr/bin/env bash
# points: 4
# desc: the pair is really enforced — teller reaches ledger, auditor times out
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual text "$(kubectl -n reticulum get netpol 2>/dev/null; echo; kubectl -n reticulum get pod --show-labels 2>/dev/null)"
  show_why "$1"
}

ip=$(kubectl -n reticulum get pod -l role=ledger \
  -o jsonpath='{.items[?(@.status.phase=="Running")].status.podIP}' 2>/dev/null | awk '{print $1}')
[ -n "$ip" ] || {
  echo "no running ledger Pod to test against"
  show_actual text "$(kubectl -n reticulum get pod --show-labels 2>/dev/null)"
  show_why "There is no Running Pod labelled role=ledger to send a request to, so the policies' effect cannot be observed either way. The three Deployments the question describes are seeded and were not yours to change."
  exit 1
}

# A denied packet is dropped rather than refused, so the client waits for a
# handshake that never comes. The timeout is what keeps the denied direction
# well inside the check's own deadline.
reaches() {
  kubectl -n reticulum exec "deploy/$1" -- \
    curl -s -m 3 -o /dev/null "http://${ip}:80" 2>/dev/null
}

crit 2 "teller still reaches ledger on port 80" \
  "teller cannot reach ledger on port 80, but the pair should allow it" \
  "The path the question asks to keep open is closed. An ingress rule allows a source only when BOTH halves match — the peer's labels and the destination port — so a rule naming the wrong label, or restricted to the wrong port, denies teller exactly as completely as no rule at all. Check the labels the Pods actually carry against the ones the policy asks for." \
  -- reaches teller

crit 2 "auditor is denied" \
  "auditor reached ledger on port 80 — the Namespace is not denying by default" \
  "Everything the pair does not explicitly allow has to be denied, and auditor got through. Either the default-deny selects nothing — an empty podSelector selects every Pod, while a selector matching none leaves those Pods unrestricted rather than protected — or it carries a rule that allows something, which an empty rule entry does. A policy that protects nothing is not a policy that denies nothing; it simply never applies." \
  -- negate reaches auditor

crit_all_passed || evidence "$(crit_why)"
report "enforced: teller allowed, auditor denied"
