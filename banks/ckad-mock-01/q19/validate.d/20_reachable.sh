#!/usr/bin/env bash
# points: 5
# desc: the Service has both endpoints and really answers from inside the cluster
set -uo pipefail
. /banks/_lib/checks.sh

# The EndpointSlice is the object the question's own hint tells the
# candidate to read, so both failures below show them the one their
# cluster actually has.
#
# There is deliberately no expected/ document for it. An EndpointSlice is
# written by a controller: its name carries a random suffix and its
# addresses are Pod IPs, so an authored "expected" one would only teach a
# candidate to look for numbers that were never going to be theirs. The
# ownerReferences, labels and generateName go for the same reason —
# nobody is being asked about the controller's bookkeeping.
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

# The Deployment was correct all along, so this only proves anything
# about the Service — and only an end-to-end request proves the
# targetPort as well as the selector.
#
# `exec` into a Pod the question already runs, rather than creating a
# probe Pod. Scheduling one, pulling its image and tearing it down cost
# most of the 30s a check is allowed, and two graders running
# back-to-back pushed checks like this one over the line — costing a
# correct answer 5 points at random. Exec is side-effect free and takes
# about a second. The request still crosses DNS, kube-proxy, the
# selector and the targetPort, which is the whole point of the check.
out=$(kubectl -n serpens exec deploy/inventory -- \
  sh -c 'for i in 1 2 3; do
           curl -s -m 4 http://inventory.serpens.svc:80/ && exit 0
           sleep 2
         done; exit 1' 2>/dev/null)
printf '%s' "$out" | grep -q inventory && { echo "service answers"; exit 0; }

echo "the Service did not answer (got: $(printf '%s' "$out" | tr '\n' ' ' | head -c 120))"
evidence "The addresses are listed, so the selector is right and this is the second fault: the port under 'ports' is where traffic is forwarded, and the container listens on 8080. Endpoints existing and the Service answering are not the same thing."
exit 1
