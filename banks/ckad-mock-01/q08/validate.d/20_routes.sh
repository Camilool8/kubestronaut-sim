#!/usr/bin/env bash
# points: 5
# desc: the controller really routes / to storefront and /checkout to checkout
set -uo pipefail
# Behavioural, not structural: an Ingress whose rules look right but which
# the controller refused to admit (wrong class, rejected by the webhook,
# a Service that does not exist) passes 10_ingress.sh and serves nothing.
# One Pod, both paths, so the whole check fits the 30s budget.
out=$(kubectl -n helios run ingress-probe-$RANDOM \
  --rm -i --restart=Never --image=nginx:1.29-alpine --command --timeout=25s -- \
  sh -c 'curl -s -m 5 -H "Host: helios.sim.local" http://ingress-nginx-controller.ingress-nginx.svc/;
         curl -s -m 5 -H "Host: helios.sim.local" http://ingress-nginx-controller.ingress-nginx.svc/checkout' \
  2>/dev/null)

printf '%s' "$out" | grep -q storefront || { echo "/ did not reach storefront (got: $(printf '%s' "$out" | tr '\n' ' '))"; exit 1; }
printf '%s' "$out" | grep -q checkout || { echo "/checkout did not reach checkout (got: $(printf '%s' "$out" | tr '\n' ' '))"; exit 1; }
echo "routing ok"
