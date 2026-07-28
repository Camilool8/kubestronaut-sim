#!/usr/bin/env bash
# points: 4
# desc: Ingress helios-routes uses class nginx, host helios.sim.local, two Prefix paths
set -uo pipefail
class=$(kubectl -n helios get ingress helios-routes -o jsonpath='{.spec.ingressClassName}' 2>/dev/null)
[ "$class" = "nginx" ] || { echo "ingressClassName is '$class', want nginx"; exit 1; }

# Every rule is read, not just the first. "One Ingress serving host X with
# two paths" is equally correct written as one rule with two paths or as
# two rules with one path each — the controller does the same thing with
# both — and indexing rules[0] failed the second spelling outright.
hosts=$(kubectl -n helios get ingress helios-routes -o json 2>/dev/null \
  | jq -r '[.spec.rules[].host] | unique | join(",")')
[ "$hosts" = "helios.sim.local" ] || { echo "host is '$hosts', want helios.sim.local"; exit 1; }

paths=$(kubectl -n helios get ingress helios-routes -o json 2>/dev/null \
  | jq -r '[.spec.rules[].http.paths[]
            | "\(.path)|\(.pathType)|\(.backend.service.name)|\(.backend.service.port.number)"]
           | sort | join(" ")')
want='/|Prefix|storefront|80 /checkout|Prefix|checkout|80'
want=$(printf '%s\n' $want | sort | tr '\n' ' '); want=${want% }
[ "$paths" = "$want" ] \
  && echo "ingress rules ok" \
  || { echo "rules are '$paths', want '$want'"; exit 1; }
