#!/usr/bin/env bash
# points: 2
# desc: Ingress helios-routes uses class nginx, host helios.sim.local, two Prefix paths
set -uo pipefail
class=$(kubectl -n helios get ingress helios-routes -o jsonpath='{.spec.ingressClassName}' 2>/dev/null)
[ "$class" = "nginx" ] || { echo "ingressClassName is '$class', want nginx"; exit 1; }

host=$(kubectl -n helios get ingress helios-routes -o jsonpath='{.spec.rules[0].host}' 2>/dev/null)
[ "$host" = "helios.sim.local" ] || { echo "host is '$host', want helios.sim.local"; exit 1; }

paths=$(kubectl -n helios get ingress helios-routes -o json 2>/dev/null \
  | jq -r '[.spec.rules[0].http.paths[]
            | "\(.path)|\(.pathType)|\(.backend.service.name)|\(.backend.service.port.number)"]
           | sort | join(" ")')
want='/|Prefix|storefront|80 /checkout|Prefix|checkout|80'
want=$(printf '%s\n' $want | sort | tr '\n' ' '); want=${want% }
[ "$paths" = "$want" ] \
  && echo "ingress rules ok" \
  || { echo "rules are '$paths', want '$want'"; exit 1; }
