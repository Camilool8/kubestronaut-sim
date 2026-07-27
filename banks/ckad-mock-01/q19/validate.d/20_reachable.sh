#!/usr/bin/env bash
# points: 5
# desc: the Service has both endpoints and really answers from inside the cluster
set -uo pipefail
count=$(kubectl -n serpens get endpointslice -l kubernetes.io/service-name=inventory -o json 2>/dev/null \
  | jq '[.items[].endpoints[]? | select(.conditions.ready == true)] | length')
[ "$count" = "2" ] || { echo "the Service has $count ready endpoints, want 2"; exit 1; }

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
printf '%s' "$out" | grep -q inventory \
  && echo "service answers" \
  || { echo "the Service did not answer (got: $(printf '%s' "$out" | tr '\n' ' ' | head -c 120))"; exit 1; }
