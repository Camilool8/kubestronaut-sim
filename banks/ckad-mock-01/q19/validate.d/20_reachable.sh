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
# Retries inside the Pod rather than by restarting it: three attempts fit
# the 30s check budget this way, one Pod launch does not.
out=$(kubectl -n serpens run svc-probe-$RANDOM \
  --rm -i --restart=Never --image=nginx:1.29-alpine --command --timeout=25s -- \
  sh -c 'for i in 1 2 3; do
           curl -s -m 4 http://inventory.serpens.svc:80/ && exit 0
           sleep 2
         done; exit 1' 2>/dev/null)
printf '%s' "$out" | grep -q inventory \
  && echo "service answers" \
  || { echo "the Service did not answer (got: $(printf '%s' "$out" | tr '\n' ' ' | head -c 120))"; exit 1; }
