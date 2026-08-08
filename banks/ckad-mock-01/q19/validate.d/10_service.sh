#!/usr/bin/env bash
# points: 3
# desc: the Service selects the Pods and targets the port they listen on
set -uo pipefail
. /banks/_lib/checks.sh

defaults='del(.spec.clusterIP, .spec.clusterIPs, .spec.internalTrafficPolicy,
              .spec.ipFamilies, .spec.ipFamilyPolicy, .spec.sessionAffinity)'
evidence() {
  show_actual yaml "$(kubectl -n serpens get svc inventory -o yaml 2>/dev/null | k8s_clean | yq "$defaults")"
  show_expected yaml "/banks/${BANK:-ckad-mock-01}/q19/expected/service.yaml"
  show_why "$1"
}

sel=$(kubectl -n serpens get svc inventory -o json 2>/dev/null | jq -r '.spec.selector | to_entries | map("\(.key)=\(.value)") | sort | join(",")')
target=$(kubectl -n serpens get svc inventory \
  -o jsonpath='{.spec.ports[?(@.port==80)].targetPort}' 2>/dev/null)

# The question says the Service is wrong in two separate ways, so the two are
# scored separately: finding the Pods, and reaching the port they listen on.
crit 2 "selects the Pods" \
  "selector is '$sel', want app=inventory" \
  "A Service finds its Pods by label, never by name. While spec.selector matches no Pod, the EndpointSlice controller has nothing to put in the Service's endpoint list, so a connection is refused rather than forwarded." \
  -- [ "$sel" = "app=inventory" ]

crit 1 "publishes port 80" \
  "the Service publishes no port 80" \
  "Clients connect to spec.ports[].port, and the question asks for that to be 80. Nothing in the Service publishes it." \
  -- [ -n "$target" ]

crit 1 "targets the port the Pods listen on" \
  "targetPort for port 80 is '$target', want 8080" \
  "targetPort is the port on the POD, and this container listens on 8080. The containerPort in the Deployment documents that and opens nothing, so a targetPort of 80 forwards to a port nothing is bound to — which hangs and times out rather than refusing." \
  -- [ "$target" = "8080" ]

crit_all_passed || evidence "$(crit_why)"
report "service fixed"
