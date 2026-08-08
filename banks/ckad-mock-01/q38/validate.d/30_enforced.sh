#!/usr/bin/env bash
# points: 4
# desc: the pair is really enforced — teller reaches ledger, auditor times out
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual text "$(kubectl -n reticulum get netpol 2>/dev/null; echo; kubectl -n reticulum get pod --show-labels 2>/dev/null)"
  show_why "$1"
}

pod=$(kubectl -n reticulum get pod -l role=ledger -o json 2>/dev/null \
  | jq -r 'first(.items[]
             | select(.status.phase == "Running" and (.status.podIP // "") != "")
             | "\(.metadata.name) \(.status.podIP)")')
ledger_pod=${pod%% *}
ip=${pod##* }
[ -n "$ip" ] || {
  echo "no running ledger Pod to test against"
  show_actual text "$(kubectl -n reticulum get pod --show-labels 2>/dev/null)"
  show_why "There is no Running Pod labelled role=ledger to send a request to, so the policies' effect cannot be observed either way. The three Deployments the question describes are seeded and were not yours to change."
  exit 1
}

deny=$(kubectl -n reticulum get netpol default-deny-ingress -o json 2>/dev/null)

# A podSelector written the way kubectl takes a selector, so the Pods it really
# picks can be listed rather than guessed at. An empty podSelector prints
# nothing, which is also how it selects every Pod in the Namespace.
selector_of() {
  printf '%s' "$1" | jq -r '
    (.spec.podSelector // {}) as $s
    | (($s.matchLabels // {}) | to_entries | map("\(.key)=\(.value)"))
      + (($s.matchExpressions // []) | map(
          if .operator == "In" then "\(.key) in (\(.values | join(",")))"
          elif .operator == "NotIn" then "\(.key) notin (\(.values | join(",")))"
          elif .operator == "Exists" then .key
          else "!\(.key)" end))
    | join(",")' 2>/dev/null
}

covers_the_ledger_pod() {
  local sel
  sel=$(selector_of "$deny")
  [ -n "$sel" ] || {
    has_name "$(kubectl -n reticulum get pod -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)" "$ledger_pod"
    return
  }
  has_name "$(kubectl -n reticulum get pod -l "$sel" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)" "$ledger_pod"
}

# Every check runs on its own, so this re-reads what 10_default-deny.sh scores.
# The question's own first line is that nothing restricts traffic here today, so
# until the default closes the Namespace over the ledger Pods, teller reaching
# them is the state the question starts in rather than anything allow-teller
# did. A rule with no 'from' does not close it either: that allows every source.
closed=false
if [ -n "$deny" ] \
  && printf '%s' "$deny" | jq -e '[.spec.policyTypes[]?] | index("Ingress")' >/dev/null 2>&1 \
  && printf '%s' "$deny" | jq -e '[.spec.ingress[]? | select(((.from // []) | length) == 0)] | length == 0' >/dev/null 2>&1 \
  && covers_the_ledger_pod; then
  closed=true
fi

# A denied packet is dropped rather than refused, so the client waits for a
# handshake that never comes. The timeout is what keeps the denied direction
# well inside the check's own deadline.
reaches() {
  kubectl -n reticulum exec "deploy/$1" -- \
    curl -s -m 3 -o /dev/null "http://${ip}:80" 2>/dev/null
}

opened_through_the_default() { [ "$closed" = true ] && reaches teller; }

if [ "$closed" = true ]; then
  allowed_msg="teller cannot reach ledger on port 80, but the pair should allow it"
else
  allowed_msg="the ledger Pods are not denied by default, so teller reaching them counts for nothing yet — default-deny-ingress has to select them, list Ingress, and not carry a rule that lets everyone in"
fi

# A request that never leaves is not a denial. exec into a Deployment with no
# ready Pod fails exactly like a dropped packet, so deleting auditor would
# otherwise score the denial it was seeded to demonstrate.
live() {
  n=$(kubectl -n reticulum get deploy "$1" -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
  [ -n "$n" ] && [ "$n" -ge 1 ] 2>/dev/null
}
denied_from_a_live_source() { live auditor && negate reaches auditor; }

crit 2 "default-deny-ingress is in force and teller still reaches ledger on port 80" \
  "$allowed_msg" \
  "The path is only open because a policy opens it once the Namespace is shut, which is why the two are scored as one thing. Before the default exists every Pod here reaches every other one — the question says so in its first line — so a successful request on its own is the starting state, not a result. Once the default is in force, an ingress rule allows a source only when BOTH halves match — the peer's labels and the destination port — so a rule naming the wrong label, or restricted to the wrong port, denies teller exactly as completely as no rule at all. Check the labels the Pods actually carry against the ones the policy asks for." \
  -- opened_through_the_default

crit 2 "auditor is denied" \
  "auditor reached ledger on port 80 — the Namespace is not denying by default, or auditor has no ready Pod to send one from" \
  "Everything the pair does not explicitly allow has to be denied, and auditor got through. Either the default-deny selects nothing — an empty podSelector selects every Pod, while a selector matching none leaves those Pods unrestricted rather than protected — or it carries a rule that allows something, which an empty rule entry does. A policy that protects nothing is not a policy that denies nothing; it simply never applies." \
  -- denied_from_a_live_source

crit_all_passed || evidence "$(crit_why)"
report "enforced: teller allowed, auditor denied"
