#!/usr/bin/env bash
# points: 4
# desc: the Service has ready endpoints and really answers from inside the cluster
set -uo pipefail
. /banks/_lib/checks.sh

view='.items[] | del(.metadata.ownerReferences, .metadata.generateName,
                     .metadata.annotations, .metadata.labels)'
evidence() {
  show_actual yaml "$(kubectl -n draco get endpointslice -l kubernetes.io/service-name=nova-api -o yaml 2>/dev/null | k8s_clean | yq "$view")"
  show_why "$1"
}

count=$(kubectl -n draco get endpointslice -l kubernetes.io/service-name=nova-api -o json 2>/dev/null \
  | jq '[.items[].endpoints[]? | select(.conditions.ready == true)] | length')
out=$(kubectl -n draco exec deploy/nova-api -- \
  sh -c 'for i in 1 2 3; do
           curl -s -m 4 http://nova-api.draco.svc:80/ && exit 0
           sleep 2
         done; exit 1' 2>/dev/null)
answers() { printf '%s' "$out" | grep -q nova-api; }

# Having endpoints and answering are not the same thing, and the question's two
# faults break them differently — so they are scored separately.
crit 1 "both Pods appear as ready endpoints" \
  "the Service has $count ready endpoints, want 2" \
  "An endpoint list with no ready addresses is the Service having found nothing to forward to. Start with the selector — compare spec.selector on the Service with the labels on the Deployment's Pod template — since a selector matching no Pod leaves the endpoint controllers with nothing to write at all." \
  -- [ "$count" = "2" ]

crit 3 "the Service really answers from inside the cluster" \
  "the Service did not answer (got: $(printf '%s' "$out" | tr '\n' ' ' | head -c 120))" \
  "The request crosses DNS, the Service's selector and its targetPort, so it succeeds only once both faults are fixed. Endpoints present and still no answer is the port: the endpoint list also carries the port kube-proxy forwards to, and a targetPort naming a port no container declares resolves to none, so a connection has nowhere to land." \
  -- answers

crit_all_passed || evidence "$(crit_why)"
report "service answers"
