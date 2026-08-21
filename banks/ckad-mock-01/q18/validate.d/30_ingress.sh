#!/usr/bin/env bash
# points: 2
# desc: the Ingress was migrated to the v1 backend schema, host and rule intact
# expected: ingress.yaml yaml
set -uo pipefail
. /banks/_lib/checks.sh

obj=$(kubectl -n lynx get ingress reports -o json 2>/dev/null)

# Only ingressClassName and the one rule the criteria below name — not the
# whole Ingress, which also carries defaultBackend, tls and annotations that
# neither criterion grades.
snapshot() {
  printf '%s' "${obj:-null}" | jq -S '
    (.spec.rules[0]) as $r |     # lint: allow-index (one rule in legacy.yaml)
    ($r.http.paths[0]) as $p |   # lint: allow-index (one path in legacy.yaml)
    {
      ingressClassName: (.spec.ingressClassName // null),
      rule: (if $r == null then null else {
        host: ($r.host // null),
        path: ($p.path // null),
        pathType: ($p.pathType // null),
        backend: {
          service: ($p.backend.service.name // null),
          port: ($p.backend.service.port.number // null)
        }
      } end)
    }
  ' | yq -p json -o yaml -P 2>/dev/null
}

evidence() {
  show_pair yaml ingress.yaml
  show_why "$1"
}

class=$(kubectl -n lynx get ingress reports -o jsonpath='{.spec.ingressClassName}' 2>/dev/null)
out=$(printf '%s' "$obj" | jq -r '
  .spec.rules[0] as $r |     # lint: allow-index (one rule in legacy.yaml)
  $r.http.paths[0] as $p |   # lint: allow-index (one path in legacy.yaml)
  "\($r.host)|\($p.path)|\($p.pathType)|\($p.backend.service.name)|\($p.backend.service.port.number)"' 2>/dev/null)
want='reports.sim.local|/|Prefix|reports|80'

crit 1 "the class moved to ingressClassName" \
  "ingressClassName is '$class', want nginx" \
  "Choosing a controller moved from an annotation to a real field when Ingress went to v1: ingressClassName is where it lives now, and the old kubernetes.io/ingress.class annotation is deprecated and acted on by nothing here. An Ingress with no class is created quite happily and never admitted by any controller." \
  -- [ "$class" = "nginx" ]

crit 1 "the rule moved to the v1 backend schema, intact" \
  "rule is '$out', want '$want'" \
  "This is the part of the migration that is not a version bump. The old flat serviceName and servicePort became a nested backend.service with a name and a port that is either a number or a name; pathType gained no default and the object is rejected without it, so an Ingress that applied at all already has one — the question asks for Prefix. The host and the backend were to keep doing exactly what they did." \
  -- [ "$out" = "$want" ]

crit_all_passed || evidence "$(crit_why)"
report "ingress migrated"
