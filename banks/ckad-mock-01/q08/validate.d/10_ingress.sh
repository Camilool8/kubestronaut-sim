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
[ "$class" = "nginx" ] || {
  echo "ingressClassName is '$class', want nginx"
  evidence "ingressClassName is what hands the object to a controller. Without one that matches an IngressClass in the cluster the Ingress is created quite happily and simply never admitted by anything — it looks identical to a working one until a request arrives. The kubernetes.io/ingress.class annotation this replaced is deprecated and is not the same field."
  exit 1
}

# Every rule is read, not just the first. "One Ingress serving host X with
# two paths" is equally correct written as one rule with two paths or as
# two rules with one path each — the controller does the same thing with
# both — and indexing rules[0] failed the second spelling outright.
hosts=$(kubectl -n helios get ingress helios-routes -o json 2>/dev/null \
  | jq -r '[.spec.rules[].host] | unique | join(",")')
[ "$hosts" = "helios.sim.local" ] || {
  echo "host is '$hosts', want helios.sim.local"
  evidence "A rule's host is matched against the request's Host header, so a rule written under a different host — or under none, which matches everything — is not the routing the question describes. The name resolves nowhere, which is why testing it means sending the header by hand."
  exit 1
}

paths=$(kubectl -n helios get ingress helios-routes -o json 2>/dev/null \
  | jq -r '[.spec.rules[].http.paths[]
            | "\(.path)|\(.pathType)|\(.backend.service.name)|\(.backend.service.port.number)"]
           | sort | join(" ")')
want='/|Prefix|storefront|80 /checkout|Prefix|checkout|80'
want=$(printf '%s\n' $want | sort | tr '\n' ' '); want=${want% }
[ "$paths" = "$want" ] && echo "ingress rules ok" || {
  echo "rules are '$paths', want '$want'"
  evidence "Each path carries its own pathType, and the two are not interchangeable: Prefix matches whole path segments beneath it, so /checkout also catches /checkout/confirm, while Exact matches that one string and nothing else. The backend names a SERVICE and a port on it, never a Pod. Writing this as one rule with two paths or as two rules with one path each is the same thing to the controller."
  exit 1
}
