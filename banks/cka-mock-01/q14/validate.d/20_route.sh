#!/usr/bin/env bash
# points: 2
# desc: HTTPRoute dorado-web-route sends web.sim.internal to dorado-web:80 and is attached to the Gateway
set -uo pipefail
. /banks/_lib/checks.sh

route=$(kubectl -n dorado get httproute dorado-web-route -o json 2>/dev/null)

[ -n "$route" ] || {
  echo "no HTTPRoute named dorado-web-route in namespace dorado"
  show_actual text "$(kubectl -n dorado get httproute 2>/dev/null)"
  show_why "The HTTPRoute is the half of this question that carries the routing: a Gateway on its own opens a listener and serves nothing, because the rules that say where a request goes live in the route, not in the Gateway. Nothing under that name exists in dorado."
  exit 1
}

hosts=$(printf '%s' "$route" | jq -r '[.spec.hostnames[]?] | join(" ")')
backends=$(printf '%s' "$route" | jq -r \
  '[.spec.rules[]?.backendRefs[]? | "\(.name // "?"):\(.port // "?")"] | unique | join(" ")')
parents=$(printf '%s' "$route" | jq -r \
  '[.spec.parentRefs[]? | "\(.name // "?")"] | unique | join(" ")')
attached=$(printf '%s' "$route" | jq -r \
  '[.status.parents[]?
    | "\(.parentRef.name // "?"): Accepted=\([.conditions[]? | select(.type == "Accepted") | .status] | first // "-") ResolvedRefs=\([.conditions[]? | select(.type == "ResolvedRefs") | .status] | first // "-")"]
   | join("; ")')
[ -n "$attached" ] || attached="nothing — the route carries no parent status at all"

routes_backend() {
  has_name "$hosts" web.sim.internal && has_name "$backends" dorado-web:80
}

route_attached() {
  printf '%s' "$route" | jq -e \
    'any(.status.parents[]?;
         .parentRef.name == "dorado-gateway"
         and any(.conditions[]?; .type == "Accepted"     and .status == "True")
         and any(.conditions[]?; .type == "ResolvedRefs" and .status == "True"))' \
    >/dev/null 2>&1
}

evidence() {
  show_actual json "$(printf '%s' "$route" | jq \
    '{parentRefs: .spec.parentRefs, hostnames: .spec.hostnames,
      rules: .spec.rules,
      status_parents: [.status.parents[]? | {parentRef: .parentRef,
        conditions: [.conditions[]? | {type, status, reason, message}]}]}')"
  show_why "$1"
}

crit 1 "web.sim.internal goes to Service dorado-web on port 80" \
  "the route matches host(s) '$hosts' and forwards to '$backends', want web.sim.internal and dorado-web:80" \
  "Two independent fields decide this, and each fails quietly on its own. hostnames is matched against the request's Host header — leave it out and the route claims every name that reaches the listener, which is broader than the question asks for. The backendRef port is the port the SERVICE publishes, not the container's: dorado-web publishes 80 and forwards to 8080 itself, so 8080 here names a port that Service does not have and the reference does not resolve." \
  -- routes_backend

crit 1 "the Gateway reports the route attached and its backend resolved" \
  "the route's status says: $attached (parentRefs name: ${parents:-nothing})" \
  "status.parents is the only place a route's fate is written, and an unattached route is the silent failure of this API: a parentRef naming a Gateway that does not exist produces no error, no event and no status — nothing claimed the route, so nothing had anything to say about it. Two conditions matter once a controller does claim it. Accepted=True means the parentRef matched a Gateway and a listener that allows this route. ResolvedRefs=True means every backendRef points at something real; False here is a Service name or port that does not exist, and the route then answers 500 rather than reaching anything." \
  -- route_attached

crit_all_passed || evidence "$(crit_why)"
report "route attached"
