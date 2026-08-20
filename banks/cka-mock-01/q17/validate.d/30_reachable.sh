#!/usr/bin/env bash
# points: 2
# desc: the named port resolves and the node port really answers from inside the cluster
set -uo pipefail
. /banks/_lib/checks.sh

# Any node's address will do — kube-proxy programs a node port on all of them —
# but a node whose kubelet is down is another question's seeded state, so take
# one the API reports Ready and say which one was used.
node=$(kubectl get nodes -o json 2>/dev/null | jq -r \
  '[.items[]? | select(any(.status.conditions[]?; .type == "Ready" and .status == "True"))
     | .status.addresses[]? | select(.type == "InternalIP") | .address] | first // empty')

[ -n "$node" ] || {
  echo "no Ready node reports an InternalIP, so there is no address to send a node-port request to"
  show_actual text "$(kubectl get nodes -o wide 2>/dev/null)"
  show_why "This is a property of the cluster rather than of the answer: a node port is reached at a node's own address, and none is available to test with."
  exit 1
}

# What the name resolved to. The endpoint list carries the port kube-proxy
# forwards to, per Pod — which is where a named targetPort stops being a string
# and becomes a number.
ports=$(kubectl -n gemini get endpointslice -l kubernetes.io/service-name=pollux-web -o json 2>/dev/null \
  | jq -r '[.items[]?.ports[]?.port | tostring] | unique | join(" ")')

out=$(kubectl -n gemini exec deploy/pollux-web -- \
  sh -c "for i in 1 2 3; do
           curl -s -m 3 http://${node}:30081/ && exit 0
           sleep 2
         done; exit 1" 2>/dev/null)
answers() { printf '%s' "$out" | grep -q 'pollux-ok'; }

evidence() {
  show_actual text "$(kubectl -n gemini get svc pollux-web 2>/dev/null; echo; kubectl -n gemini get endpointslice -l kubernetes.io/service-name=pollux-web 2>/dev/null)"
  show_why "$1"
}

crit 1 "the named port resolves to 8080 in the endpoint list" \
  "the endpoint list publishes port(s) '$ports', want 8080" \
  "A name is not resolved when you write it — nothing validates it then, and the API accepts a name no container answers to without complaint. It is looked up when endpoints are computed, against the names in each selected Pod's containers[].ports, and the number it resolves to is what lands in the EndpointSlice. Empty means no Pod was selected at all; 80 means targetPort was left out, so it defaulted to the Service's own port; anything else means the name is on the wrong entry." \
  -- has_name "$ports" 8080

crit 1 "the node port answers from inside the cluster" \
  "nothing answered on ${node}:30081 (got: $(printf '%s' "$out" | tr '\n' ' ' | head -c 120))" \
  "The request crosses DNS-free routing, the Service's selector, its node port and its targetPort, so it succeeds only once all of them are right. kube-proxy programs the node port on EVERY node, so any node's address answers and there is no need to find the one running a Pod. Endpoints listed and still no answer points at the port rather than the selector." \
  -- answers

crit_all_passed || evidence "$(crit_why)"
report "node port answers"
