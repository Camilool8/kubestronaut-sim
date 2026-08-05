#!/usr/bin/env bash
# points: 5
# desc: a request through the Service really comes back from the green release
set -uo pipefail
. /banks/_lib/checks.sh

# The behavioural half, and the one worth the most points: a selector
# that looks right in YAML and a Service that actually delivers green are
# different claims, and only the second one is the release.
#
# The request is made from checkout-client, which is neither release, so
# it crosses DNS, the Service, kube-proxy and the EndpointSlice exactly
# as a caller would. Retried because a selector edit and a reprogrammed
# kube-proxy are not the same instant — the EndpointSlice updates first —
# and a single attempt straight after the answer loses that race often
# enough to fail correct work.
body=""
for _ in 1 2 3 4 5; do
  body=$(kubectl -n lacerta exec deploy/checkout-client -- \
    wget -q -T 4 -O - http://checkout.lacerta.svc:80/ 2>/dev/null)
  case "$body" in *green*) break ;; esac
  sleep 2
done

case "$body" in
  *green*) echo "the Service serves the green release"; exit 0 ;;
esac

if [ -z "$body" ]; then
  echo "no answer came back through the Service"
  show_actual text "$(kubectl -n lacerta get endpointslices -l kubernetes.io/service-name=checkout \
    -o jsonpath='{range .items[*]}{.metadata.name}{": "}{.endpoints[*].addresses[0]}{"\n"}{end}' 2>/dev/null)"  # lint: allow-index (one Pod IP per endpoint is all this pane needs to show)
  show_why "A Service with no endpoints refuses the connection rather than routing it. The EndpointSlice above lists what the selector actually found; an empty one means the labels named in the selector are on no Pod in this Namespace."
  exit 1
fi

echo "the Service answered '$(printf '%s' "$body" | tr -d '\n')', which is not the green release"
show_actual text "$body"
show_why "The bodies are how the two releases are told apart, and this one came from blue. A selector that still matches blue's Pods — or matches both — sends traffic there whatever the intent was; the Service is the only thing that decides, and it decides by label."
exit 1
