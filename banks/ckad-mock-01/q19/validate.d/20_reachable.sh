#!/usr/bin/env bash
# points: 6
# desc: the Service has both endpoints and really answers from inside the cluster
set -uo pipefail
. /banks/_lib/checks.sh

view='.items[] | del(.metadata.ownerReferences, .metadata.generateName,
                     .metadata.annotations, .metadata.labels)'
evidence() {
  show_actual yaml "$(kubectl -n serpens get endpointslice -l kubernetes.io/service-name=inventory -o yaml 2>/dev/null | k8s_clean | yq "$view")"
  show_why "$1"
}

count=$(kubectl -n serpens get endpointslice -l kubernetes.io/service-name=inventory -o json 2>/dev/null \
  | jq '[.items[].endpoints[]? | select(.conditions.ready == true)] | length')
[ "$count" = "2" ] || {
  echo "the Service has $count ready endpoints, want 2"
  evidence "An endpoint list with no ready addresses means the Service is selecting no Pod at all — that is the selector, not the port. Compare spec.selector on the Service with the labels on the Deployment's Pod template."
  exit 1
}

out=$(kubectl -n serpens exec deploy/inventory -- \
  sh -c 'for i in 1 2 3; do
           curl -s -m 4 http://inventory.serpens.svc:80/ && exit 0
           sleep 2
         done; exit 1' 2>/dev/null)
printf '%s' "$out" | grep -q inventory && { echo "service answers"; exit 0; }

echo "the Service did not answer (got: $(printf '%s' "$out" | tr '\n' ' ' | head -c 120))"
evidence "The addresses are listed, so the selector is right and this is the second fault: the port under 'ports' is where traffic is forwarded, and the container listens on 8080. Endpoints existing and the Service answering are not the same thing."
exit 1
