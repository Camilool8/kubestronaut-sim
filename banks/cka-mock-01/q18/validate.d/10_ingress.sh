#!/usr/bin/env bash
# points: 3
# desc: Ingress phoenix-routes uses class nginx, one host, and two Prefix paths to api:8080 and web:80
set -uo pipefail
. /banks/_lib/checks.sh

evidence() {
  show_actual yaml "$(kubectl -n phoenix get ingress phoenix-routes -o yaml 2>/dev/null | k8s_clean)"
  show_expected yaml "/banks/${BANK:-cka-mock-01}/q18/expected/ingress.yaml"
  show_why "$1"
}

kubectl -n phoenix get ingress phoenix-routes >/dev/null 2>&1 || {
  echo "no Ingress named phoenix-routes in Namespace phoenix"
  show_actual text "$(kubectl -n phoenix get ingress 2>/dev/null)"
  show_why "Nothing publishes these two Deployments under a host name yet. The Services in front of them are ClusterIPs and stay ClusterIPs — an Ingress is a separate object that names them as backends, and the whole answer to this question is that one object."
  exit 1
}

ing=$(kubectl -n phoenix get ingress phoenix-routes -o json 2>/dev/null)
class=$(kubectl -n phoenix get ingress phoenix-routes \
  -o jsonpath='{.spec.ingressClassName}' 2>/dev/null)
hosts=$(printf '%s' "$ing" \
  | jq -r '[.spec.rules[]? | .host // "(no host)"] | unique | join(",")')
paths=$(printf '%s' "$ing" \
  | jq -r '[.spec.rules[]? | .http.paths[]?
            | "\(.path)|\(.pathType)|\(.backend.service.name)|\(.backend.service.port.number // .backend.service.port.name)"]
           | sort | join(" ")')

# Sorted by path, which puts /api ahead of /web, so the answer compares equal
# however the candidate ordered the two rules.
want='/api|Prefix|api|8080 /web|Prefix|web|80'

crit 1 "handed to the nginx IngressClass" \
  "ingressClassName is '$class', want nginx" \
  "ingressClassName is what hands the object to a controller. Without one that matches an IngressClass in the cluster the Ingress is created quite happily and is never admitted by anything, which looks identical to a working one until a request arrives. The kubernetes.io/ingress.class annotation this replaced is deprecated and is not the same field — k get ingressclass names the one this cluster registers." \
  -- [ "$class" = "nginx" ]

crit 1 "every rule under host q18-phoenix.sim.local" \
  "hosts are '$hosts', want q18-phoenix.sim.local alone" \
  "A rule's host is matched against the request's Host header, so a rule written under another host — or under none, which matches every host — is not the routing the question describes. The question asks for one host serving both paths, so both paths belong to that host: either as two entries under a single rule, or as two rules that name the same host." \
  -- [ "$hosts" = "q18-phoenix.sim.local" ]

crit 1 "both paths route by prefix to the right Service and port" \
  "rules are '$paths', want '$want'" \
  "Each path carries its own pathType, and the two are not interchangeable: Prefix matches whole path segments beneath it, so /api also catches /api/v1/orders, while Exact matches that one string and nothing else. The backend names a SERVICE and a port on that Service, never a Pod and never a container port — and the two Services here do not listen on the same number, so the second rule is not a copy of the first with the path changed." \
  -- [ "$paths" = "$want" ]

crit_all_passed || evidence "$(crit_why)"
report "ingress rules ok"
