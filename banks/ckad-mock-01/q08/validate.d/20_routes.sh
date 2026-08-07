#!/usr/bin/env bash
# points: 6
# desc: the controller really routes / to storefront and /checkout to checkout
set -uo pipefail
. /banks/_lib/checks.sh
out=$(kubectl -n helios exec deploy/storefront -- \
  sh -c 'curl -s -m 4 -H "Host: helios.sim.local" http://ingress-nginx-controller.ingress-nginx.svc/;
         curl -s -m 4 -H "Host: helios.sim.local" http://ingress-nginx-controller.ingress-nginx.svc/checkout' \
  2>/dev/null)

evidence() {
  show_actual text "$(kubectl -n helios get ingress,svc,endpointslice 2>/dev/null)"
  show_why "$1"
}

answered() { printf '%s' "$out" | grep -q "$1"; }

crit 1 "/ reaches storefront" \
  "/ did not reach storefront (got: $(printf '%s' "$out" | tr '\n' ' '))" \
  "An Ingress the controller never admitted looks exactly like one that works: the object exists, the rules read correctly and nothing routes. The ADDRESS column stays empty when no controller has claimed it — a class matching no IngressClass, or a backend Service that does not exist in this Namespace, are the two usual causes, and the Service list beside it says which." \
  -- answered storefront

crit 1 "/checkout reaches checkout" \
  "/checkout did not reach checkout (got: $(printf '%s' "$out" | tr '\n' ' '))" \
  "If / reached storefront then the controller has admitted this Ingress and only the second rule is not doing its job. ingress-nginx picks the longest matching prefix regardless of the order the paths are listed in, so this is the rule itself: its path, its pathType, or the Service and port it names." \
  -- answered checkout

crit_all_passed || evidence "$(crit_why)"
report "routing ok"
