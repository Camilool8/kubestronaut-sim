#!/usr/bin/env bash
# points: 4
# desc: the controller really serves the portal over HTTPS, with the Secret's certificate
# expected: none — this execs into a Pod and curls the controller over TLS,
#           grading whether the response body arrives and which certificate
#           the handshake actually served, both live readings taken at probe
#           time rather than a document either side authored. The messages
#           already name what came back.
set -uo pipefail
. /banks/_lib/checks.sh

ip=$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.spec.clusterIP}' 2>/dev/null)
[ -n "$ip" ] || {
  echo "could not find the ingress controller's address"
  show_actual text "$(kubectl -n ingress-nginx get svc 2>/dev/null)"
  show_why "The ingress-nginx controller Service reported no cluster address, so there is nowhere to send the request. That is a property of the cluster rather than of the answer."
  exit 1
}

out=$(kubectl -n sculptor exec deploy/portal -- sh -c \
  "for i in 1 2; do
     curl -skv -m 5 --resolve sculptor.sim.local:443:${ip} https://sculptor.sim.local/ 2>&1 && exit 0
     sleep 2
   done; exit 1" 2>/dev/null)

# curl -v prefixes its own transcript; whatever is left unprefixed is the body.
body=$(printf '%s' "$out" | grep -v '^[*<>{}]' | tr -d '\r' | tr '\n' ' ' | head -c 120)

evidence() {
  show_actual text "$(printf '%s' "$out" | head -c 3000)"
  show_why "$1"
}

saw() { printf '%s' "$out" | grep -q "$1"; }
own_cert() { saw 'Server certificate' && negate saw 'Fake Certificate'; }

crit 3 "the portal answers over HTTPS on sculptor.sim.local" \
  "https://sculptor.sim.local/ answered '$body', want portal-ok" \
  "The request went to the controller carrying sculptor.sim.local as its name and did not come back with the application. An Ingress the controller never admitted looks exactly like one that works — the object exists, the rules read correctly and nothing routes — and a class matching no IngressClass, or a backend Service that is not in this Namespace, are the two usual causes. A 404 page instead of the body means the request arrived and no rule claimed it, which is the host or the path." \
  -- saw 'portal-ok'

crit 1 "served with the certificate from your Secret" \
  "the handshake used the controller's own placeholder certificate, not portal-tls" \
  "ingress-nginx keeps a self-signed placeholder called 'Kubernetes Ingress Controller Fake Certificate' and serves it whenever it cannot load the one an Ingress asked for. Seeing it means the routing works and the TLS half does not: the Secret is missing from this Namespace, is named differently under spec.tls, is not of type kubernetes.io/tls, or its host does not match the one the request put in SNI. SNI is settled during the handshake, before any header is sent, which is why a Host header cannot select a certificate and --resolve can." \
  -- own_cert

crit_all_passed || evidence "$(crit_why)"
report "https served from the portal-tls certificate"
