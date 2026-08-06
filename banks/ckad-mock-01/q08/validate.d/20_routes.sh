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

printf '%s' "$out" | grep -q storefront || {
  echo "/ did not reach storefront (got: $(printf '%s' "$out" | tr '\n' ' '))"
  evidence "An Ingress the controller never admitted looks exactly like one that works: the object exists, the rules read correctly and nothing routes. The ADDRESS column stays empty when no controller has claimed it — a class matching no IngressClass, or a backend Service that does not exist in this Namespace, are the two usual causes, and the Service list beside it says which."
  exit 1
}
printf '%s' "$out" | grep -q checkout || {
  echo "/checkout did not reach checkout (got: $(printf '%s' "$out" | tr '\n' ' '))"
  evidence "The request for / reached storefront, so the controller has admitted this Ingress and only the second rule is not doing its job. ingress-nginx picks the longest matching prefix regardless of the order the paths are listed in, so this is the rule itself: its path, its pathType, or the Service and port it names."
  exit 1
}
echo "routing ok"
