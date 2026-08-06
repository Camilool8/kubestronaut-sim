#!/usr/bin/env bash
# points: 4
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
[ "$sel" = "app=inventory" ] || {
  echo "selector is '$sel', want app=inventory"
  evidence "A Service finds its Pods by label, never by name. While spec.selector matches no Pod, the EndpointSlice controller has nothing to put in the Service's endpoint list, so a connection is refused rather than forwarded."
  exit 1
}

target=$(kubectl -n serpens get svc inventory \
  -o jsonpath='{.spec.ports[?(@.port==80)].targetPort}' 2>/dev/null)
[ -n "$target" ] || {
  echo "the Service publishes no port 80"
  evidence "Clients connect to spec.ports[].port, and the question asks for that to be 80. Nothing in the Service publishes it."
  exit 1
}
[ "$target" = "8080" ] && { echo "service fixed"; exit 0; }
echo "targetPort for port 80 is '$target', want 8080"
evidence "targetPort is the port on the POD, and this container listens on 8080. The containerPort in the Deployment documents that and opens nothing, so a targetPort of 80 forwards to a port nothing is bound to — which hangs and times out rather than refusing."
exit 1
