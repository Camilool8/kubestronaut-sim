#!/usr/bin/env bash
# points: 4
# desc: the policies are really enforced — db and 9090 time out, frontend still reaches api:8080 and DNS
# expected: none — this sends real traffic and a DNS lookup between seeded
#           Pods and grades what gets through or times out, an event
#           measured at probe time rather than a document; the NetworkPolicy
#           shapes it depends on are already paired by the checks that grade
#           them.
set -uo pipefail
. /banks/_lib/checks.sh

probe_fe=''
probe_db=''

evidence() {
  show_actual text "$(printf 'probes from the frontend Pod:\n%s\n\nprobes from the db Pod:\n%s\n\npolicies in hydra:\n%s\n\nPods:\n%s\n' \
    "${probe_fe:-(not asked)}" "${probe_db:-(not asked)}" \
    "$(kubectl -n hydra get netpol 2>/dev/null)" \
    "$(kubectl -n hydra get pod --show-labels 2>/dev/null)")"
  show_why "$1"
}

pods=$(kubectl -n hydra get pod -o json 2>/dev/null)

# One Running Pod per tier, with the address to send to. Pod names and IPs are
# read here and never graded — both change under every rollout and every
# restart of the environment.
pick() {
  printf '%s' "$pods" | jq -r --arg t "$1" '
    first(.items[]?
      | select(.metadata.labels.tier == $t
               and .status.phase == "Running"
               and ((.status.podIP // "") != "")
               and (.metadata.deletionTimestamp == null))
      | "\(.metadata.name) \(.status.podIP)")' 2>/dev/null
}

fe=$(pick frontend); fe_pod=${fe%% *}
api=$(pick api);     api_ip=${api##* }
db=$(pick db);       db_pod=${db%% *}; db_ip=${db##* }

missing=''
[ -n "$fe" ] || missing="frontend"
[ -n "$api" ] || missing="${missing:+$missing, }api"
[ -n "$db" ] || missing="${missing:+$missing, }db"
[ -z "$missing" ] || {
  echo "no Running Pod with an address for: $missing"
  evidence "This check is decided by traffic, so it needs all three tiers running to send it: the frontend Pod opens the connections, the api Pod is what may be reached on 8080, and the db Pod is both a source that must be refused and a destination that must not be reachable. The three Deployments are seeded and are not part of what this question asks you to change — a policy cannot be shown to deny anything from a Pod that no longer exists, so deleting one scores nothing rather than everything."
  exit 1
}

# Every probe is bounded, because a denied packet is dropped rather than
# refused: without a timeout the client would sit there until this check is
# killed at 30 seconds and scored failed. Worst case here is three 2-second
# waits plus a 3-second lookup from the frontend Pod and one 2-second wait from
# the db Pod.
probe_fe=$(kubectl -n hydra exec "$fe_pod" -- sh -c "
  wget -q -T 2 -O /dev/null http://${api_ip}:8080/ 2>/dev/null && echo 'api8080 ok' || echo 'api8080 blocked'
  wget -q -T 2 -O /dev/null http://${api_ip}:9090/ 2>/dev/null && echo 'api9090 ok' || echo 'api9090 blocked'
  wget -q -T 2 -O /dev/null http://${db_ip}:5432/ 2>/dev/null && echo 'db5432 ok' || echo 'db5432 blocked'
  timeout 3 nslookup api.hydra.svc.cluster.local >/dev/null 2>&1 && echo 'dns ok' || echo 'dns failed'
" 2>&1)

probe_db=$(kubectl -n hydra exec "$db_pod" -- sh -c "
  wget -q -T 2 -O /dev/null http://${api_ip}:8080/ 2>/dev/null && echo 'api8080 ok' || echo 'api8080 blocked'
" 2>&1)

res() { printf '%s\n' "$2" | awk -v k="$1" '$1 == k {print $2}'; }

# The do-no-harm gate. Blocking everything is not an answer, and it would
# otherwise be indistinguishable from a correct one on the three criteria
# below — every one of which is about traffic that must NOT arrive.
[ "$(res api8080 "$probe_fe")" = "ok" ] || {
  echo "a frontend Pod cannot reach the api Pod on 8080, which the application needs"
  evidence "Closing the Namespace is half the task; the application still has to work through it. Two policies have to agree for this one connection: the api Pods must accept ingress from the frontend Pods on 8080, AND the frontend Pods must be allowed egress to the api Pods on 8080 — the default denies both directions, so an allowance for one of them alone still leaves the packet dropped at the other end. This whole check scores nothing while the path is shut, because everything else it grades is traffic that is supposed to be refused."
  exit 1
}

# ------------------------------------------------------- is egress really shut?
#
# Every check runs on its own, so this re-reads what 10_default-deny.sh scores,
# and it is what stops the DNS criterion from being free: on the untouched
# Namespace DNS resolves perfectly, because nothing denies anything yet. DNS
# only becomes evidence of an egress rule once egress is denied by default.
pols=$(kubectl -n hydra get netpol -o json 2>/dev/null)

wide_egress=$(printf '%s' "$pols" | jq '[.items[]? | .spec.egress[]?
  | select(((.to // []) | length) == 0 and ((.ports // []) | length) == 0)] | length' 2>/dev/null)

egress_selectors=$(printf '%s' "$pols" | jq -r '
  .items[]?
  | select([.spec.policyTypes[]?] | index("Egress"))
  | (.spec.podSelector // {}) as $s
  | "sel:" + (
      (($s.matchLabels // {}) | to_entries | map("\(.key)=\(.value)"))
      + (($s.matchExpressions // []) | map(
          if .operator == "In" then "\(.key) in (\(.values | join(",")))"
          elif .operator == "NotIn" then "\(.key) notin (\(.values | join(",")))"
          elif .operator == "Exists" then .key
          else "!\(.key)" end))
      | join(","))' 2>/dev/null)

egress_closed=false
if [ "${wide_egress:-1}" = "0" ]; then
  while IFS= read -r line; do
    case $line in
      sel:*) sel=${line#sel:} ;;
      *) continue ;;
    esac
    # An empty selector is the widest one: it selects every Pod here, this one
    # included. Any other selector is resolved through the API rather than
    # guessed at, so a policy written with matchExpressions counts too.
    if [ -z "$sel" ]; then
      egress_closed=true
      break
    fi
    if has_name "$(kubectl -n hydra get pod -l "$sel" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)" "$fe_pod"; then
      egress_closed=true
      break
    fi
  done <<EOF
$egress_selectors
EOF
fi

if [ "$egress_closed" = true ]; then
  dns_msg="cluster DNS no longer resolves from a frontend Pod"
else
  dns_msg="nothing denies egress from the frontend Pods yet, so a name resolving counts for nothing — it resolved before the question was asked"
fi

db_to_api_denied() { [ "$(res api8080 "$probe_db")" = "blocked" ]; }
admin_port_denied() { [ "$(res api9090 "$probe_fe")" = "blocked" ]; }
frontend_to_db_denied() { [ "$(res db5432 "$probe_fe")" = "blocked" ]; }
dns_allowed_through_the_deny() { [ "$egress_closed" = true ] && [ "$(res dns "$probe_fe")" = "ok" ]; }

crit 1 "the db Pod cannot reach api on 8080" \
  "the db Pod reached api on 8080" \
  "Everything the policies do not explicitly allow has to be denied, and db got through. Either nothing denies ingress to the api Pods — an empty podSelector selects every Pod, while a selector matching none leaves those Pods unrestricted rather than protected — or the allowance names a peer wider than the frontend Pods. A policy that protects nothing is not a policy that denies nothing; it simply never applies." \
  -- db_to_api_denied

crit 1 "api's admin port 9090 is not reachable from frontend" \
  "the frontend Pod reached api on 9090" \
  "Both halves of a rule have to match for traffic to be allowed: the peer AND the port. A rule that names the frontend Pods but no ports allows them every port on the api Pods, 9090 included, and looks perfectly least-privilege in a listing because the peer is narrow. The ports list is the half doing the work here — and the same is true of the egress rule at the other end." \
  -- admin_port_denied

crit 1 "the frontend Pod cannot reach db on 5432" \
  "the frontend Pod reached db on 5432" \
  "The frontend Pods are allowed out to exactly two places, and db is not one of them; the db Pods are allowed in from nowhere at all. Either end alone would drop this connection, so it arriving means the default is not selecting every Pod in the Namespace, or something still allows more than it names — a rule with no peer allows every destination, and a rule with no ports allows every port on the peers it does name." \
  -- frontend_to_db_denied

crit 1 "DNS still resolves from frontend, through the deny" \
  "$dns_msg" \
  "This is the trap in closing egress: policyTypes Egress denies every outbound packet the rules do not allow, and name resolution is outbound like everything else. The symptom looks nothing like a policy problem — the application starts, then fails on every name it tries — and the fix is an egress rule naming the cluster's DNS Pods in kube-system on port 53, UDP and TCP. Name those Pods rather than an address: a Service's ClusterIP is translated to a Pod address, and the documentation leaves it undefined whether policy sees the address before or after that." \
  -- dns_allowed_through_the_deny

crit_all_passed || evidence "$(crit_why)"
report "enforced: one path open, everything else denied"
