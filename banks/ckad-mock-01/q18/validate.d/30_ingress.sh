#!/usr/bin/env bash
# points: 3
# desc: the Ingress was migrated to the v1 backend schema, host and rule intact
set -uo pipefail
class=$(kubectl -n lynx get ingress reports -o jsonpath='{.spec.ingressClassName}' 2>/dev/null)
[ "$class" = "nginx" ] || { echo "ingressClassName is '$class', want nginx"; exit 1; }

# v1beta1's serviceName/servicePort became a nested service object with a
# named-or-numbered port, and pathType became mandatory. This is the part
# of the migration that is not a version bump.
out=$(kubectl -n lynx get ingress reports -o json 2>/dev/null | jq -r '
  .spec.rules[0] |
  "\(.host)|\(.http.paths[0].path)|\(.http.paths[0].pathType)|\(.http.paths[0].backend.service.name)|\(.http.paths[0].backend.service.port.number)"')
want='reports.sim.local|/|Prefix|reports|80'
[ "$out" = "$want" ] \
  && echo "ingress migrated" \
  || { echo "rule is '$out', want '$want'"; exit 1; }
