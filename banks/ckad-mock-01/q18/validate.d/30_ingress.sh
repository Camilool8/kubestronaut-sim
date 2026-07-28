#!/usr/bin/env bash
# points: 3
# desc: the Ingress was migrated to the v1 backend schema, host and rule intact
set -uo pipefail
class=$(kubectl -n lynx get ingress reports -o jsonpath='{.spec.ingressClassName}' 2>/dev/null)
[ "$class" = "nginx" ] || { echo "ingressClassName is '$class', want nginx"; exit 1; }

# v1beta1's serviceName/servicePort became a nested service object with a
# named-or-numbered port, and pathType became mandatory. This is the part
# of the migration that is not a version bump.
#
# The indices are pinned by the question, not by assumption: this is a
# conversion of a manifest the candidate was given, which holds exactly
# one rule with exactly one path, and the instruction is to keep the host
# and backend doing what they did. An Ingress that grew a second rule
# failed that instruction before it reached this check.
out=$(kubectl -n lynx get ingress reports -o json 2>/dev/null | jq -r '
  .spec.rules[0] as $r |     # lint: allow-index (one rule in legacy.yaml)
  $r.http.paths[0] as $p |   # lint: allow-index (one path in legacy.yaml)
  "\($r.host)|\($p.path)|\($p.pathType)|\($p.backend.service.name)|\($p.backend.service.port.number)"')
want='reports.sim.local|/|Prefix|reports|80'
[ "$out" = "$want" ] \
  && echo "ingress migrated" \
  || { echo "rule is '$out', want '$want'"; exit 1; }
