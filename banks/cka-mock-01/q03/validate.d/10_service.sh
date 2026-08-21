#!/usr/bin/env bash
# points: 3
# desc: the Service selects the Pods and references the container port by its name
# expected: service.yaml yaml
set -uo pipefail
. /banks/_lib/checks.sh

snapshot() {
  kubectl -n draco get svc nova-api -o json 2>/dev/null | jq -S '
    {selector: (.spec.selector // {}),
     targetPort: ((.spec.ports[]? | select(.port == 80) | .targetPort) // null)}' \
    | yq -p json -o yaml -P 2>/dev/null
}

evidence() {
  show_pair yaml service.yaml
  show_why "$1"
}

sel=$(kubectl -n draco get svc nova-api -o json 2>/dev/null | jq -r '.spec.selector | to_entries | map("\(.key)=\(.value)") | sort | join(",")')
target=$(kubectl -n draco get svc nova-api \
  -o jsonpath='{.spec.ports[?(@.port==80)].targetPort}' 2>/dev/null)

# The question says the Service disagrees with the Deployment in two separate
# places, so the two are scored separately: finding the Pods, and naming the
# port they listen on.
crit 2 "selects the Pods" \
  "selector is '$sel', want app=nova-api" \
  "A Service finds its Pods by label, never by name. The Deployment's Pod template carries app=nova-api; while spec.selector asks for anything else, the endpoint controllers have nothing to list and every connection is refused." \
  -- [ "$sel" = "app=nova-api" ]

crit 1 "targetPort references the container port by its name" \
  "targetPort for port 80 is '$target', want http-api" \
  "The container's port is named http-api and the question asks the Service to keep forwarding to it by that name rather than by number. A named targetPort is resolved per Pod against the names in that Pod's containers[].ports, so it has to match letter for letter: a name no container answers to resolves to no port at all, which leaves the Service's endpoint list with nothing for kube-proxy to forward traffic to. Nothing rejects the name when you write it — it is only looked up when endpoints are computed." \
  -- [ "$target" = "http-api" ]

crit_all_passed || evidence "$(crit_why)"
report "service fixed"
