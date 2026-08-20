#!/usr/bin/env bash
# points: 3
# desc: both paths answer over HTTPS through the Gateway's own address, and the legacy Ingress is gone
set -uo pipefail
. /banks/_lib/checks.sh

host=q15-lacerta.sim.local

svcs=$(kubectl -n lacerta get svc -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)
if ! has_name "$svcs" storefront || ! has_name "$svcs" checkout; then
  echo "Service storefront or checkout is missing from Namespace lacerta (found: $(name_list "$svcs"))"
  show_actual text "$(kubectl -n lacerta get deploy,svc 2>/dev/null)"
  show_why "Both Services were seeded with the Namespace and neither was yours to change: the Ingress named them as backends and the HTTPRoute is meant to name the same two. With one of them gone there is no backend for a route to resolve, and no way to tell a request that was routed correctly from one that had nowhere to go."
  exit 1
fi

ready=$(kubectl -n lacerta get deploy storefront -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
have_client() { [ -n "$ready" ] && [ "$ready" -ge 1 ] 2>/dev/null; }
have_client || {
  echo "no ready Pod of Deployment storefront to send the request from"
  show_actual text "$(kubectl -n lacerta get deploy,pod 2>/dev/null)"
  show_why "The request is made from inside the cluster, from a Pod this question seeded, because everything it has to reach is a ClusterIP. Deployment storefront has no ready Pod to make it in — it was seeded and was not yours to change — and without it the routing cannot be observed at all."
  exit 1
}

# The address comes from the Gateway rather than from the Service the
# controller provisions for it: that Service's name is the controller's to
# choose and never something to grade or depend on.
gw_address() {
  local a
  a=$(kubectl -n lacerta get gateway lacerta-gateway \
    -o jsonpath='{.status.addresses[*].value}' 2>/dev/null | awk '{print $1}')
  if [ -z "$a" ]; then
    # Fallback for a controller that does not publish the address on the
    # Gateway: the data plane is the only thing in this Namespace listening on
    # 443, so it is selected by port and not by name.
    a=$(kubectl -n lacerta get svc -o json 2>/dev/null \
      | jq -r 'first(.items[]? | select([.spec.ports[]?.port] | index(443)) | .spec.clusterIP) // empty')
  fi
  printf '%s' "$a"
}

addr=$(gw_address)

# Both paths in one exec: two round trips of kubectl exec would spend more of
# the check's 30s budget on connections than on requests. -sS keeps the
# progress meter off and lets curl's own error through, because "unrecognized
# name" from the proxy is the most useful thing this check can report.
probe() {
  kubectl -n lacerta exec deploy/storefront -- sh -c \
    "printf 'store: '; curl -sSk -m 3 --resolve '${host}:443:${addr}' 'https://${host}/store' 2>&1 | tr -d '\r\n';
     printf '\ncheckout: '; curl -sSk -m 3 --resolve '${host}:443:${addr}' 'https://${host}/checkout' 2>&1 | tr -d '\r\n'; echo" 2>&1
}

answered() { printf '%s\n' "$out" | grep -m1 "^$1" | grep -q "$2"; }

# What came back for one path, for the message. Falls back to the whole reply
# when the labelled line is missing, so "nothing was sent at all" reads as that
# rather than as an empty answer.
said() {
  local line
  line=$(printf '%s\n' "$out" | grep -m1 "^$1")
  [ -n "$line" ] || line=$(printf '%s' "$out" | tr '\n' ' ')
  printf '%s' "$line" | head -c 160
}

served_store() { answered 'store:' 'storefront-ok'; }
served_checkout() { answered 'checkout:' 'checkout-ok'; }
# Asked as "what Ingresses are there", not as "does this one exist": a lookup
# that fails for any reason other than absence then fails the criterion rather
# than passing it, which is the safe way round for a point awarded for a
# deletion.
ingress_gone() {
  local names
  names=$(kubectl -n lacerta get ingress -o jsonpath='{.items[*].metadata.name}' 2>/dev/null) || return 1
  ! has_name "$names" lacerta-legacy
}

out='no Gateway address to send a request to'
if [ -n "$addr" ]; then
  out=$(probe)
  # The data plane is configured a moment after the Gateway reports itself
  # programmed, so one retry separates "not done" from "done a second ago".
  if ! served_store || ! served_checkout; then
    sleep 2
    out=$(probe)
  fi
fi

evidence() {
  show_actual text "$(printf 'gateway address: %s\n\nwhat came back:\n%s\n\nlacerta:\n%s\n' \
    "${addr:-none published}" \
    "$(printf '%s\n' "$out" | head -c 1000)" \
    "$(kubectl -n lacerta get gateway,httproute,ingress,svc 2>/dev/null)")"
  show_why "$1"
}

crit 1 "/store answers over HTTPS" \
  "https://${host}/store gave '$(said 'store:')', want storefront-ok" \
  "The request was sent to the Gateway's address with the host name in the URL, so the client offered that name in SNI and sent it as the Host header too. A TLS error naming 'unrecognized name' is the handshake being refused: the proxy has no listener for the name that was offered, which is the listener's hostname field or a listener that was never programmed. A refused connection means nothing is listening on 443 at that address at all. A 404 means the handshake and the listener were fine and no route claimed the request, which is the route's hostnames or its path match. A 500 with no body means a route claimed it and its backend resolved to nothing." \
  -- served_store

crit 1 "/checkout answers over HTTPS" \
  "https://${host}/checkout gave '$(said 'checkout:')', want checkout-ok" \
  "If /store came back and this did not, the listener and the attachment are both fine and only the second rule is not doing its job: its path, or the Service and port it names. The two backends do not publish the same port — 80 and 8080 — so a second rule copied from the first keeps a port that checkout does not serve, which the proxy answers as an error rather than as a wrong page. The word storefront-ok arriving here would mean the two backends are crossed." \
  -- served_checkout

crit 1 "the legacy Ingress is gone" \
  "Ingress lacerta-legacy is still in Namespace lacerta" \
  "The migration is not finished while both objects are live. Two controllers claiming one host name is not an error in Kubernetes — ingress-nginx and this Gateway keep serving it from different addresses, each with its own copy of the certificate — so nothing tells you the old path is still there except looking. Delete it last, once the new path answers: deleting it first leaves the host unserved while you write the replacement, and on a real migration that is the outage." \
  -- ingress_gone

crit_all_passed || evidence "$(crit_why)"
report "migrated"
