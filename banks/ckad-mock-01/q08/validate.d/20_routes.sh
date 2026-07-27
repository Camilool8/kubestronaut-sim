#!/usr/bin/env bash
# points: 5
# desc: the controller really routes / to storefront and /checkout to checkout
set -uo pipefail
# Behavioural, not structural: an Ingress whose rules look right but which
# the controller refused to admit (wrong class, rejected by the webhook,
# a Service that does not exist) passes 10_ingress.sh and serves nothing.
#
# `exec` into a Pod the question already runs rather than creating a
# probe Pod. Scheduling one costs most of the 30s a check is allowed,
# and checks shaped like this one timed out — costing a correct answer 5
# points — when two grading runs happened back-to-back. The request goes
# out to the ingress controller's Service and back, so it still proves
# the controller admitted and routes the rule.
out=$(kubectl -n helios exec deploy/storefront -- \
  sh -c 'curl -s -m 4 -H "Host: helios.sim.local" http://ingress-nginx-controller.ingress-nginx.svc/;
         curl -s -m 4 -H "Host: helios.sim.local" http://ingress-nginx-controller.ingress-nginx.svc/checkout' \
  2>/dev/null)

printf '%s' "$out" | grep -q storefront || { echo "/ did not reach storefront (got: $(printf '%s' "$out" | tr '\n' ' '))"; exit 1; }
printf '%s' "$out" | grep -q checkout || { echo "/checkout did not reach checkout (got: $(printf '%s' "$out" | tr '\n' ' '))"; exit 1; }
echo "routing ok"
