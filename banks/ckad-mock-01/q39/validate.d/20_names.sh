#!/usr/bin/env bash
# points: 4
# desc: all three Pods are ready endpoints and each answers on its own DNS name
# expected: none — an EndpointSlice is written by a controller, with a random
#           name suffix and Pod IPs for addresses, so an authored "expected"
#           one would only teach a candidate to look for numbers that were
#           never going to be theirs; and whether curl from inside shard-0
#           resolves each per-Pod name is a live behavioural reading, not a
#           document either. Both criteria's messages already name what
#           they saw.
set -uo pipefail
. /banks/_lib/checks.sh

view='.items[] | del(.metadata.ownerReferences, .metadata.generateName,
                     .metadata.annotations, .metadata.labels)'
evidence() {
  show_actual yaml "$(kubectl -n telescopium get endpointslice -l kubernetes.io/service-name=shard -o yaml 2>/dev/null | k8s_clean | yq "$view")"
  show_why "$1"
}

count=$(kubectl -n telescopium get endpointslice -l kubernetes.io/service-name=shard -o json 2>/dev/null \
  | jq '[.items[].endpoints[]? | select(.conditions.ready == true)] | length')
count=${count:-0}

out=$(kubectl -n telescopium exec shard-0 -- sh -c \
  'for h in shard-1 shard-2; do
     curl -s -m 4 "http://${h}.shard.telescopium.svc.cluster.local/"
   done' 2>/dev/null)

named() { printf '%s' "$out" | grep -q "$1"; }
per_pod_names() { named 'shard-1' && named 'shard-2'; }

crit 2 "all three Pods appear as ready endpoints" \
  "the Service has $count ready endpoints, want 3" \
  "An endpoint list that is short or empty means the Service is selecting fewer Pods than the set runs. Compare spec.selector on the Service with the labels on the StatefulSet's Pod template — and remember a headless Service publishes its endpoints as DNS answers, so the address list IS what the name resolves to." \
  -- [ "$count" = "3" ]

crit 2 "each Pod answers on its own DNS name" \
  "shard-1 and shard-2 did not both answer on their per-Pod names (got: $(printf '%s' "$out" | tr '\n' ' ' | head -c 120))" \
  "The name shard-N.shard.telescopium.svc.cluster.local exists because the StatefulSet gives each Pod a stable hostname and sets its subdomain to the governing Service's name — and because that Service is headless. Point the same set at an ordinary ClusterIP Service and the per-Pod names stop resolving while the Service's own name keeps working, which is exactly the failure this criterion catches." \
  -- per_pod_names

crit_all_passed || evidence "$(crit_why)"
report "per-Pod names resolve"
