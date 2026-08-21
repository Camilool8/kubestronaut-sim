#!/usr/bin/env bash
# points: 3
# desc: Ingress portal-https routes sculptor.sim.local to portal:80 and ends TLS with portal-tls
# expected: ingress.json json
set -uo pipefail
. /banks/_lib/checks.sh

# The grading below is order-independent — rules/tlshosts/tlssecret all sort
# before comparing — so the pane has to be too: a candidate who writes the
# tls block before the rule, or lists a second host ahead of the first, is
# exactly as correct as the reference solution's own order.
snapshot() {
  kubectl -n sculptor get ingress portal-https -o json 2>/dev/null | jq -S '{
    ingressClassName: (.spec.ingressClassName // null),
    rules: ([(.spec.rules // [])[]? | .host as $h | (.http.paths // [])[]? | {
        host: $h,
        path: .path,
        pathType: .pathType,
        service: .backend.service.name,
        port: (.backend.service.port.number // .backend.service.port.name)
      }] | sort_by(.host, .path, .service, .port)),
    tls: ([(.spec.tls // [])[]? | {secretName: .secretName, hosts: ((.hosts // []) | sort)}]
      | sort_by(.secretName))
  }' 2>/dev/null
}

evidence() {
  show_pair json ingress.json
  show_why "$1"
}

kubectl -n sculptor get ingress portal-https >/dev/null 2>&1 || {
  echo "no Ingress named portal-https in Namespace sculptor"
  show_actual text "$(kubectl -n sculptor get ingress 2>/dev/null)"
  show_why "Nothing publishes the portal outside the cluster yet. The Service in front of it is a ClusterIP and stays one; an Ingress is a separate object that names it as a backend."
  exit 1
}

class=$(kubectl -n sculptor get ingress portal-https -o jsonpath='{.spec.ingressClassName}' 2>/dev/null)
rules=$(kubectl -n sculptor get ingress portal-https -o json 2>/dev/null \
  | jq -r '[.spec.rules[]? | .host as $h | .http.paths[]?
            | "\($h)|\(.path)|\(.pathType)|\(.backend.service.name)|\(.backend.service.port.number)"]
           | sort | join(" ")')
tlshosts=$(kubectl -n sculptor get ingress portal-https -o json 2>/dev/null \
  | jq -r '[.spec.tls[]?.hosts[]?] | sort | join(",")')
tlssecret=$(kubectl -n sculptor get ingress portal-https -o json 2>/dev/null \
  | jq -r '[.spec.tls[]?.secretName] | unique | join(",")')

tls_ok() { [ "$tlshosts" = "sculptor.sim.local" ] && [ "$tlssecret" = "portal-tls" ]; }

crit 1 "handed to the nginx IngressClass" \
  "ingressClassName is '$class', want nginx" \
  "ingressClassName is what hands the object to a controller. Without one that matches an IngressClass in the cluster the Ingress is created quite happily and never admitted by anything, which looks identical to a working one until a request arrives." \
  -- [ "$class" = "nginx" ]

crit 1 "routes sculptor.sim.local / to portal:80 by prefix" \
  "rules are '$rules', want 'sculptor.sim.local|/|Prefix|portal|80'" \
  "The rule decides where a request goes once it has arrived: its host is matched against the request's Host header, and the backend names a SERVICE and a port on it, never a Pod. Prefix matches whole path segments beneath /, which is every path on this host." \
  -- [ "$rules" = "sculptor.sim.local|/|Prefix|portal|80" ]

crit 2 "ends TLS for that host with Secret portal-tls" \
  "spec.tls covers hosts '$tlshosts' with secret '$tlssecret', want sculptor.sim.local and portal-tls" \
  "spec.tls and spec.rules are separate lists that happen to name the same host. rules decides routing, by Host header, after the connection is up; tls decides which Secret ends the encryption, selected during the handshake by SNI. A host listed under rules alone is served over plain HTTP only, and a secretName that resolves to nothing leaves the controller serving its own placeholder certificate to anyone who asks." \
  -- tls_ok

crit_all_passed || evidence "$(crit_why)"
report "ingress ok"
