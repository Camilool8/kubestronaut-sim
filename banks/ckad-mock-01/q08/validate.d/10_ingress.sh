#!/usr/bin/env bash
# points: 5
# desc: Ingress helios-routes uses class nginx, host helios.sim.local, two Prefix paths
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual yaml "$(kubectl -n helios get ingress helios-routes -o yaml 2>/dev/null | k8s_clean)"
  show_expected yaml "/banks/${BANK:-ckad-mock-01}/q08/expected/ingress.yaml"
  show_why "$1"
}

class=$(kubectl -n helios get ingress helios-routes -o jsonpath='{.spec.ingressClassName}' 2>/dev/null)
hosts=$(kubectl -n helios get ingress helios-routes -o json 2>/dev/null \
  | jq -r '[.spec.rules[].host] | unique | join(",")')
paths=$(kubectl -n helios get ingress helios-routes -o json 2>/dev/null \
  | jq -r '[.spec.rules[].http.paths[]
            | "\(.path)|\(.pathType)|\(.backend.service.name)|\(.backend.service.port.number)"]
           | sort | join(" ")')
want='/|Prefix|storefront|80 /checkout|Prefix|checkout|80'
want=$(printf '%s\n' $want | sort | tr '\n' ' '); want=${want% }

crit 2 "handed to the nginx IngressClass" \
  "ingressClassName is '$class', want nginx" \
  "ingressClassName is what hands the object to a controller. Without one that matches an IngressClass in the cluster the Ingress is created quite happily and simply never admitted by anything — it looks identical to a working one until a request arrives. The kubernetes.io/ingress.class annotation this replaced is deprecated and is not the same field." \
  -- [ "$class" = "nginx" ]

crit 1 "every rule under host helios.sim.local" \
  "host is '$hosts', want helios.sim.local" \
  "A rule's host is matched against the request's Host header, so a rule written under a different host — or under none, which matches everything — is not the routing the question describes. The name resolves nowhere, which is why testing it means sending the header by hand." \
  -- [ "$hosts" = "helios.sim.local" ]

crit 2 "both paths route to the right Service and port" \
  "rules are '$paths', want '$want'" \
  "Each path carries its own pathType, and the two are not interchangeable: Prefix matches whole path segments beneath it, so /checkout also catches /checkout/confirm, while Exact matches that one string and nothing else. The backend names a SERVICE and a port on it, never a Pod. Writing this as one rule with two paths or as two rules with one path each is the same thing to the controller." \
  -- [ "$paths" = "$want" ]

crit_all_passed || evidence "$(crit_why)"
report "ingress rules ok"
