#!/usr/bin/env bash
# points: 2
# desc: the two allow policies open exactly frontend->api:8080 and DNS, and nothing in hydra allows all
# expected: least-privilege.json json
set -uo pipefail
. /banks/_lib/checks.sh

pols=$(kubectl -n hydra get netpol -o json 2>/dev/null)

# Only the two named policies' authored shape gets a generated document:
# podSelector, policyTypes and the rules themselves (peers and ports), the
# fields this check compares field-by-field against a wanted shape. Which
# live Pods a selector resolves to is read only to accept a semantically
# equivalent matchExpressions in place of matchLabels — the same way
# q01/20_probe.sh resolves a named port through the container's own ports —
# and is deliberately not baked into the pane; nor is the namespace-wide
# open-rule scan the second criterion also runs, whose outcome already rides
# on that criterion's own message and why text below.
#
# The grading below is provably order-independent — in_peers/in_ports/eg_ports
# all flatten across every rule and compare via same_set — so the pane has to
# be too. Each rule's own ports and peers are sorted (ports normalised to an
# explicit protocol first, since an omitted protocol and a written 'TCP' are
# the same rule and must not render as one), and the outer ingress/egress
# rule arrays are sorted too: a candidate who writes the DNS rule before the
# api rule, or TCP before UDP within it, is exactly as correct as the
# reference solution's own order and must produce a byte-identical pane.
snapshot() {
  printf '%s' "${pols:-null}" | jq -S '
    def norm_ports: (. // []) | map({port: .port, protocol: (.protocol // "TCP")}) | sort_by(.protocol, .port);
    {
      "allow-api-ingress": (
        (first(.items[]? | select(.metadata.name == "allow-api-ingress")) // null) as $p
        | if $p == null then null else {
            podSelector: ($p.spec.podSelector // {}),
            policyTypes: (($p.spec.policyTypes // []) | sort),
            ingress: (($p.spec.ingress // [])
              | map({from: ((.from // []) | sort), ports: (.ports | norm_ports)})
              | sort)
          } end
      ),
      "allow-frontend-egress": (
        (first(.items[]? | select(.metadata.name == "allow-frontend-egress")) // null) as $p
        | if $p == null then null else {
            podSelector: ($p.spec.podSelector // {}),
            policyTypes: (($p.spec.policyTypes // []) | sort),
            egress: (($p.spec.egress // [])
              | map({to: ((.to // []) | sort), ports: (.ports | norm_ports)})
              | sort)
          } end
      )
    }
  ' 2>/dev/null
}

evidence() {
  show_pair json least-privilege.json
  show_why "$1"
}

policy() { printf '%s' "$pols" | jq -c --arg n "$1" 'first(.items[]? | select(.metadata.name == $n)) // empty' 2>/dev/null; }

in_pol=$(policy allow-api-ingress)
eg_pol=$(policy allow-frontend-egress)

missing=''
[ -n "$in_pol" ] || missing="allow-api-ingress"
[ -n "$eg_pol" ] || missing="${missing:+$missing and }allow-frontend-egress"
[ -z "$missing" ] || {
  echo "Namespace hydra has no NetworkPolicy named $missing"
  show_actual text "$(kubectl -n hydra get netpol 2>/dev/null)"
  show_why "Nothing reopens the path the default closed. There is no deny rule in this API and no precedence between policies: a Pod permits the union of what every policy selecting it allows, so each exception has to be its own object contributing its own allowance — one for the ingress the api Pods accept, one for the egress the frontend Pods are permitted. Both names are fixed by the question, and a policy under another name is invisible to this check."
  exit 1
}

# What a selector really picks, rather than how it was spelled. matchLabels and
# an equivalent matchExpressions select the same Pods and are equally correct
# answers, so both are resolved through the API and compared as Pod sets.
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

pod_names() { kubectl -n hydra get pod -l "$1" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null | tr -s '[:space:]' '\n'; }
all_pods=$(kubectl -n hydra get pod -o jsonpath='{.items[*].metadata.name}' 2>/dev/null | tr -s '[:space:]' '\n')

selected_pods() {
  local sel
  sel=$(selector_of "$1")
  if [ -z "$sel" ]; then printf '%s\n' "$all_pods"; else pod_names "$sel"; fi
}

api_pods=$(pod_names tier=api)
fe_pods=$(pod_names tier=frontend)
in_selected=$(selected_pods "$in_pol")
eg_selected=$(selected_pods "$eg_pol")

# ------------------------------------------------------------------- ingress
in_rules=$(printf '%s' "$in_pol" | jq '(.spec.ingress // []) | length' 2>/dev/null)
in_peers=$(printf '%s' "$in_pol" | jq -r '[.spec.ingress[]?.from[]? | (.podSelector.matchLabels // {}) | to_entries[] | "\(.key)=\(.value)"] | .[]' 2>/dev/null)
in_wide=$(printf '%s' "$in_pol" | jq '[.spec.ingress[]?.from[]? | select(has("namespaceSelector") or has("ipBlock"))] | length' 2>/dev/null)
in_ports=$(printf '%s' "$in_pol" | jq -r '[.spec.ingress[]?.ports[]? | "\(.port)/\(.protocol // "TCP")"] | .[]' 2>/dev/null)
in_governs=$(printf '%s' "$in_pol" | jq -r '.spec.policyTypes[]?' 2>/dev/null)

ingress_problem=''
if ! same_set "$in_selected" "$api_pods"; then
  ingress_problem="allow-api-ingress selects Pods '$(printf '%s' "$in_selected" | tr '\n' ' ')', want the tier=api Pods '$(printf '%s' "$api_pods" | tr '\n' ' ')'"
elif ! has_name "$(printf '%s' "$in_governs" | tr '\n' ' ')" Ingress; then
  ingress_problem="policyTypes are '$(printf '%s' "$in_governs" | tr '\n' ' ')', which does not include Ingress"
elif [ "${in_rules:-0}" != "1" ]; then
  ingress_problem="the policy carries ${in_rules:-0} ingress rule(s), want exactly 1"
elif ! same_set "$in_peers" "tier=frontend" || [ "${in_wide:-1}" != "0" ]; then
  ingress_problem="the ingress peers are '$(printf '%s' "$in_peers" | tr '\n' ' ')' plus ${in_wide:-?} namespaceSelector/ipBlock peer(s), want the tier=frontend Pods alone"
elif ! same_set "$in_ports" "8080/TCP"; then
  ingress_problem="the ingress ports are '$(printf '%s' "$in_ports" | tr '\n' ' ')', want 8080/TCP"
fi
ingress_least_privilege() { [ -z "$ingress_problem" ]; }

# -------------------------------------------------------------------- egress
eg_rules=$(printf '%s' "$eg_pol" | jq '(.spec.egress // []) | length' 2>/dev/null)
eg_open=$(printf '%s' "$eg_pol" | jq '[.spec.egress[]? | select(((.to // []) | length) == 0)] | length' 2>/dev/null)
eg_portless=$(printf '%s' "$eg_pol" | jq '[.spec.egress[]? | select(((.ports // []) | length) == 0)] | length' 2>/dev/null)
eg_unnamed=$(printf '%s' "$eg_pol" | jq '[.spec.egress[]?.to[]? | select(has("podSelector") | not)] | length' 2>/dev/null)
eg_ports=$(printf '%s' "$eg_pol" | jq -r '[.spec.egress[]?.ports[]? | "\(.port)/\(.protocol // "TCP")"] | .[]' 2>/dev/null)
eg_governs=$(printf '%s' "$eg_pol" | jq -r '.spec.policyTypes[]?' 2>/dev/null)

# The whole Namespace, not just the two named policies: one rule anywhere in
# hydra that names no peer, or names every address, reopens what the default
# closed.
ns_open=$(printf '%s' "$pols" | jq '[.items[]?
  | ( (.spec.ingress[]? | select(((.from // []) | length) == 0)),
      (.spec.egress[]?  | select(((.to   // []) | length) == 0)) )] | length' 2>/dev/null)
ns_anywhere=$(printf '%s' "$pols" | jq '[.items[]?
  | (.spec.ingress[]?.from[]?, .spec.egress[]?.to[]?)
  | select( ((.ipBlock.cidr // "") == "0.0.0.0/0")
            or ( has("namespaceSelector") and (has("podSelector") | not)
                 and (((.namespaceSelector.matchLabels // {}) | length) == 0)
                 and (((.namespaceSelector.matchExpressions // []) | length) == 0) ) )] | length' 2>/dev/null)

want_ports=$(printf '8080/TCP\n53/UDP\n53/TCP')

egress_problem=''
if ! same_set "$eg_selected" "$fe_pods"; then
  egress_problem="allow-frontend-egress selects Pods '$(printf '%s' "$eg_selected" | tr '\n' ' ')', want the tier=frontend Pods '$(printf '%s' "$fe_pods" | tr '\n' ' ')'"
elif ! has_name "$(printf '%s' "$eg_governs" | tr '\n' ' ')" Egress; then
  egress_problem="policyTypes are '$(printf '%s' "$eg_governs" | tr '\n' ' ')', which does not include Egress"
elif [ "${eg_rules:-0}" = "0" ]; then
  egress_problem="the policy carries no egress rule at all"
elif [ "${eg_open:-1}" != "0" ]; then
  egress_problem="${eg_open} egress rule(s) name no destination at all, which allows every destination"
elif [ "${eg_portless:-1}" != "0" ]; then
  egress_problem="${eg_portless} egress rule(s) name no port, which allows every port on that destination"
elif [ "${eg_unnamed:-1}" != "0" ]; then
  egress_problem="${eg_unnamed} egress peer(s) do not select Pods — every peer here names Pods by label"
elif ! same_set "$eg_ports" "$want_ports"; then
  egress_problem="the egress ports are '$(printf '%s' "$eg_ports" | tr '\n' ' ')', want 8080/TCP for api and 53/UDP plus 53/TCP for DNS"
elif [ "${ns_open:-1}" != "0" ] || [ "${ns_anywhere:-1}" != "0" ]; then
  egress_problem="a policy in hydra still carries ${ns_open:-?} rule(s) with no peer and ${ns_anywhere:-?} peer(s) that match every Namespace or every address"
fi
egress_least_privilege() { [ -z "$egress_problem" ]; }

crit 1 "the api Pods accept exactly one way in: tier=frontend on TCP 8080" \
  "$ingress_problem" \
  "spec.podSelector names the Pods the policy applies TO — the destination being protected — while a podSelector under 'from' names the source, by label, inside the same Namespace; naming the source in both places is the classic swap and leaves the api Pods with no allowance at all. Ingress rules are additive, so a second rule widens the opening rather than narrowing it, and a namespaceSelector or ipBlock beside the peer widens it to other Namespaces or to raw addresses. The ports list is what holds this to 8080: leave it out and the same source reaches 9090 too." \
  -- ingress_least_privilege

crit 1 "the frontend Pods may leave only for api:8080 and DNS, and nothing in hydra allows all" \
  "$egress_problem" \
  "Egress rules are read the same way and get one thing extra wrong: with Egress in policyTypes, DNS is denied like everything else, so the resolver has to be named as a destination or every name in the cluster stops resolving. Both halves of a rule matter — a rule with no 'to' allows every destination, and a rule with no ports allows every port on the destinations it names, which is how a policy that looks least-privilege quietly reopens 9090. Port 53 needs both protocols: UDP for ordinary queries and TCP for answers too large for one datagram." \
  -- egress_least_privilege

crit_all_passed || evidence "$(crit_why)"
report "least-privilege ok"
