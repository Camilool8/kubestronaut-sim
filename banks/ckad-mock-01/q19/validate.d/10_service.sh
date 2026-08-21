#!/usr/bin/env bash
# points: 3
# desc: the Service selects the Pods and targets the port they listen on
# expected: service.yaml yaml
set -uo pipefail
. /banks/_lib/checks.sh

snapshot() {
  kubectl -n serpens get svc inventory -o json 2>/dev/null | jq -S '
    {selector: (.spec.selector // {}),
     targetPort: ((.spec.ports[]? | select(.port == 80) | .targetPort) // null)}' \
    | yq -p json -o yaml -P 2>/dev/null
}

evidence() {
  show_pair yaml service.yaml
  show_why "$1"
}

sel=$(kubectl -n serpens get svc inventory -o json 2>/dev/null | jq -r '.spec.selector | to_entries | map("\(.key)=\(.value)") | sort | join(",")')
target=$(kubectl -n serpens get svc inventory \
  -o jsonpath='{.spec.ports[?(@.port==80)].targetPort}' 2>/dev/null)

# Publishing port 80 is the one thing the broken Service already gets right, so
# it is scored with the fault it accompanies rather than on its own: the forward
# has to have moved, and to have moved on targetPort rather than by renumbering
# the port clients connect to.
fixed_on_target_port() { [ -n "$target" ] && [ "$target" != "80" ]; }

if [ -n "$target" ]; then
  port_msg="port 80 still forwards to port 80 — the fault is on targetPort, and nothing has changed it"
else
  port_msg="the Service publishes no port 80 for a client to connect to"
fi

# The question says the Service is wrong in two separate ways, so the two are
# scored separately: finding the Pods, and reaching the port they listen on.
crit 2 "selects the Pods" \
  "selector is '$sel', want app=inventory" \
  "A Service finds its Pods by label, never by name. While spec.selector matches no Pod, the EndpointSlice controller has nothing to put in the Service's endpoint list, so a connection is refused rather than forwarded." \
  -- [ "$sel" = "app=inventory" ]

crit 1 "fixes the port fault on targetPort, leaving port 80 to clients" \
  "$port_msg" \
  "Clients connect to spec.ports[].port and the question asks for that to be 80 — which it already was, so publishing it is not work this question asked for. targetPort is the POD-side port and that is where this fault lives: renumbering port to 8080 forwards to the right place at an address nobody was told to use, and leaving both at 80 forwards to a port nothing is bound to." \
  -- fixed_on_target_port

crit 1 "targets the port the Pods listen on" \
  "targetPort for port 80 is '$target', want 8080" \
  "targetPort is the port on the POD, and this container listens on 8080. The containerPort in the Deployment documents that and opens nothing, so a targetPort of 80 forwards to a port nothing is bound to — which hangs and times out rather than refusing." \
  -- [ "$target" = "8080" ]

crit_all_passed || evidence "$(crit_why)"
report "service fixed"
