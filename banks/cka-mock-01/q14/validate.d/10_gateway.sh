#!/usr/bin/env bash
# points: 3
# desc: Gateway dorado-gateway asks for GatewayClass sim, serves HTTP on 80, and is Programmed
# expected: gateway.json json
set -uo pipefail
. /banks/_lib/checks.sh

gw=$(kubectl -n dorado get gateway dorado-gateway -o json 2>/dev/null)

[ -n "$gw" ] || {
  echo "no Gateway named dorado-gateway in namespace dorado"
  show_actual text "$(kubectl -n dorado get gateway 2>/dev/null)"
  show_why "The Gateway is the object this question asks you to create, and nothing under that name exists in dorado. A GatewayClass is not a Gateway: the class is cluster-scoped and describes which controller is willing to serve, while the Gateway is the namespaced object that asks it to, and only creating one makes the controller provision anything."
  exit 1
}

class=$(printf '%s' "$gw" | jq -r '.spec.gatewayClassName // ""')
listeners=$(printf '%s' "$gw" | jq -r \
  '[.spec.listeners[]? | "\(.protocol // "?"):\(.port // "?")"] | unique | join(" ")')
programmed=$(printf '%s' "$gw" | jq -r \
  '[.status.conditions[]? | select(.type == "Programmed") | .status] | first // ""')
prog_msg=$(printf '%s' "$gw" | jq -r \
  '[.status.conditions[]? | select(.type == "Programmed") | .message] | first // "no Programmed condition has been written at all"')

# Only the authored half — the class and the listener's protocol/port — gets
# a generated document. Whether the controller reports Programmed is a live
# status reading, not a document, and its verdict is already carried by that
# criterion's own message and why text below; a second pane here would
# collide with this one in the UI, which shows one actual/expected pair per
# check, not per criterion.
snapshot() {
  printf '%s' "${gw:-null}" | jq -S '{
    gatewayClassName: (.spec.gatewayClassName // null),
    listeners: ([(.spec.listeners // [])[]? | {protocol: (.protocol // null), port: (.port // null)}] | sort_by(.protocol, .port))
  }' 2>/dev/null
}

evidence() {
  show_pair json gateway.json
  show_why "$1"
}

crit 1 "asks for GatewayClass sim" \
  "gatewayClassName is '$class', want sim" \
  "gatewayClassName is what decides whether any controller acts on this object, and it is immutable — a Gateway created against a class name that does not exist is not adopted later when you notice, it has to be replaced. This cluster registers exactly one class; 'k get gatewayclass' names it, and the class's own Accepted condition is the controller saying it will serve objects that ask for it." \
  -- [ "$class" = "sim" ]

crit 1 "an HTTP listener on port 80" \
  "the listeners declare '$listeners', want HTTP:80" \
  "A listener is protocol AND port together, and both are graded here because either alone routes nothing. Note that this is the port the Gateway serves on, not the port of the Service behind it: the backend's port belongs to the HTTPRoute's backendRef and the two numbers are free to differ. A listener also needs a name — it is what an HTTPRoute's sectionName refers to — but the name is not what makes traffic arrive." \
  -- has_name "$listeners" "HTTP:80"

crit 1 "the controller reports it Programmed" \
  "the Programmed condition is '$programmed', want True — the controller says: $prog_msg" \
  "Programmed is the controller's statement that it has provisioned the data plane this Gateway describes and the address below is live. It is the difference between an object the API accepted and a proxy that exists: Accepted means the spec is valid and the class is served, Programmed means it is actually running. This controller provisions a private nginx deployment per Gateway, so the condition can take a few seconds after the object is created — but False with a reason is not slowness, it is the listener being rejected." \
  -- [ "$programmed" = "True" ]

crit_all_passed || evidence "$(crit_why)"
report "gateway programmed"
