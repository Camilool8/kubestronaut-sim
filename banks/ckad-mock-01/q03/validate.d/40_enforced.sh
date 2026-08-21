#!/usr/bin/env bash
# points: 4
# desc: the policy is actually enforced — frontend reaches api, metrics does not
# expected: none — this grades whether traffic is actually allowed or denied
#           between two live Pods, a relationship observed by sending real
#           requests rather than a shape the candidate wrote down. The message
#           and why text already name which side failed and why.
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual yaml "$(kubectl -n orbit get netpol api-guard -o yaml 2>/dev/null | k8s_clean)"
  show_why "$1"
}

pod=$(kubectl -n orbit get pod -l role=api -o json 2>/dev/null \
  | jq -r 'first(.items[]
             | select(.status.phase == "Running" and (.status.podIP // "") != "")
             | "\(.metadata.name) \(.status.podIP)")')
api_pod=${pod%% *}
api=${pod##* }
[ -n "$api" ] || {
  echo "no running api Pod to test against"
  show_actual text "$(kubectl -n orbit get pod --show-labels 2>/dev/null)"
  show_why "There is no Running Pod labelled role=api to send a request to, so the policy's effect cannot be observed either way. The three Deployments the question describes are seeded and were not yours to change."
  exit 1
}

np=$(kubectl -n orbit get netpol api-guard -o json 2>/dev/null)

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

selects_the_api_pod() {
  local sel
  sel=$(selector_of "$np")
  [ -n "$sel" ] || {
    has_name "$(kubectl -n orbit get pod -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)" "$api_pod"
    return
  }
  has_name "$(kubectl -n orbit get pod -l "$sel" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)" "$api_pod"
}

# Every check runs on its own, so this re-reads what 10_np-exists.sh scores.
# Until something governs ingress to THESE Pods and names who may connect, the
# api Pods are unrestricted and every Pod in the cluster reaches them: a
# successful request would then be evidence that no policy exists rather than
# evidence that this one permits the traffic.
guarded=false
if [ -n "$np" ] \
  && printf '%s' "$np" | jq -e '[.spec.policyTypes[]?] | index("Ingress")' >/dev/null 2>&1 \
  && printf '%s' "$np" | jq -e '[.spec.ingress[]? | select(((.from // []) | length) == 0)] | length == 0' >/dev/null 2>&1 \
  && selects_the_api_pod; then
  guarded=true
fi

reaches() {
  kubectl -n orbit exec "deploy/$1" -- \
    wget -q -T 5 -O /dev/null "http://${api}:80" 2>/dev/null
}

allowed_by_the_policy() { [ "$guarded" = true ] && reaches frontend; }

if [ "$guarded" = true ]; then
  allowed_msg="frontend cannot reach api on port 80, but the policy should allow it"
else
  allowed_msg="nothing is governing ingress to the api Pods, so frontend reaching them counts for nothing yet — api-guard has to select those Pods, list Ingress, and say who may connect"
fi

# A request that never leaves is not a denial. exec into a Deployment with no
# ready Pod fails exactly like a dropped packet, so deleting metrics would
# otherwise score the denial it was seeded to demonstrate.
live() {
  n=$(kubectl -n orbit get deploy "$1" -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
  [ -n "$n" ] && [ "$n" -ge 1 ] 2>/dev/null
}
denied_from_a_live_source() { live metrics && negate reaches metrics; }

crit 2 "api-guard is in force and frontend still reaches api on port 80" \
  "$allowed_msg" \
  "Reaching the api Pods only means the policy allows it once the policy applies to them, which is why the two are scored as one thing. With no policy selecting those Pods — or with one whose ingress rule names no peer at all — they are open to everything and frontend's request succeeds exactly as it did before the question was asked. Once the policy is in force, an ingress rule allows a source only if BOTH halves match — the peer's labels and the destination port — so a rule naming the wrong label, or restricted to the wrong port, denies frontend just as completely as no rule at all would." \
  -- allowed_by_the_policy

crit 3 "metrics is denied" \
  "metrics reached api on port 80 — ingress is not restricted to role=frontend, or metrics has no ready Pod to send one from" \
  "Everything that is not explicitly allowed has to be denied, and metrics got through. Either spec.podSelector matches no Pod — a policy that protects nothing is not a policy that allows everything, it simply never applies — or the ingress rule's peer selector is wider than role=frontend." \
  -- denied_from_a_live_source

crit_all_passed || evidence "$(crit_why)"
report "policy enforced: frontend allowed, metrics denied"
