#!/usr/bin/env bash
# points: 3
# desc: HTTPRoute lacerta-routes attaches to lacerta-gateway for the host, carries both prefix paths to storefront:80 and checkout:8080, and the Gateway accepted it
set -uo pipefail
. /banks/_lib/checks.sh

host=q15-lacerta.sim.local

rt=$(kubectl -n lacerta get httproute lacerta-routes -o json 2>/dev/null)
[ -n "$rt" ] || {
  echo "no HTTPRoute named lacerta-routes in Namespace lacerta"
  show_actual text "$(kubectl -n lacerta get httproute 2>/dev/null)"
  show_why "The Gateway is the listener and the certificate; it carries no rules and sends nothing anywhere on its own. The paths that used to live in the Ingress belong in an HTTPRoute, a separate object that names the Gateway as its parent and the Services as its backends. Until one exists and attaches, the listener answers the handshake and then has nowhere to send the request."
  exit 1
}

evidence() {
  show_actual yaml "$(kubectl -n lacerta get httproute lacerta-routes -o yaml 2>/dev/null | k8s_clean)"
  # TODO(lead): generate expected/httproute.yaml per docs/bank-spec.md:588-622
  show_expected yaml "/banks/${BANK:-cka-mock-01}/q15/expected/httproute.yaml"
  show_why "$1"
}

parents=$(printf '%s' "$rt" | jq -r '[.spec.parentRefs[]?
  | "\(.kind // "Gateway")/\(.namespace // "lacerta")/\(.name)"] | join(" ")')
hosts=$(printf '%s' "$rt" | jq -r '[.spec.hostnames[]?] | join(",")')

# Every match paired with every backend of its own rule, sorted, so the answer
# compares equal however the two rules were ordered.
rules=$(printf '%s' "$rt" | jq -r '[.spec.rules[]? as $r
  | $r.matches[]? as $m
  | $r.backendRefs[]?
  | "\($m.path.type // "PathPrefix")\($m.path.value // "/")|\(.name)|\(.port // "(no port)")"]
  | sort | join(" ")')
want='PathPrefix/checkout|checkout|8080 PathPrefix/store|storefront|80'

attached=$(printf '%s' "$rt" | jq -r '[.status.parents[]?
  | select(.parentRef.name == "lacerta-gateway") | .conditions[]?
  | select(.type == "Accepted" or .type == "ResolvedRefs") | "\(.type)=\(.status)"]
  | sort | unique | join(" ")')
complaints=$(printf '%s' "$rt" | jq -r '[.status.parents[]?.conditions[]?
  | select(.status != "True") | "\(.type)=\(.status): \(.message)"] | join("; ")' | head -c 300)

parented_at_the_host() {
  [ "$parents" = "Gateway/lacerta/lacerta-gateway" ] && [ "$hosts" = "$host" ]
}

crit 1 "attached to lacerta-gateway for the host" \
  "parentRefs are '${parents:-none}' and hostnames '${hosts:-none}', want Gateway/lacerta/lacerta-gateway and ${host} alone" \
  "A route is not claimed by the Gateway it happens to sit beside: parentRefs is the attachment, written from the route's side, and a route with none is an object nothing reads. The hostnames on the route are intersected with the listener's own host name, so a route carrying a different name — or one carrying none, which means every name the listener answers to — is not the routing being migrated. A parentRef with no namespace means this one; sectionName is optional here because the Gateway has a single listener for the route to land on." \
  -- parented_at_the_host

crit 1 "both prefix paths to the right Service and port" \
  "the route resolves to '${rules:-nothing}', want '$want'" \
  "Each rule pairs matches with backendRefs, and both halves are graded because both are easy to carry over wrongly. PathPrefix is the type that matches whole segments beneath the value, the equivalent of the Ingress's Prefix; the default type when none is written is PathPrefix as well, but the value is not optional. A backendRef names a Service and the port that SERVICE publishes — these two do not publish the same number, so the second rule is not a copy of the first with the path changed. Note that a route may hold several rules, or one rule with several matches: what matters is which backend each path ends at." \
  -- [ "$rules" = "$want" ]

crit 1 "the Gateway accepted the route" \
  "the Gateway reports '${attached:-nothing at all}' for this route, want Accepted=True ResolvedRefs=True${complaints:+ — $complaints}" \
  "The controller writes back per parent, and this is the line that separates a route that reads correctly from a route that is actually attached. Accepted=False means the Gateway refused the attachment — a listener whose allowedRoutes does not admit this Namespace, or hostnames that intersect nothing the listener serves. ResolvedRefs=False means it took the route and could not resolve a backend: a Service name that does not exist in this Namespace, or a port no Service publishes. Nothing here is retried on your behalf, so the status is current." \
  -- [ "$attached" = "Accepted=True ResolvedRefs=True" ]

crit_all_passed || evidence "$(crit_why)"
report "route ok"
