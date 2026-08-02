#!/usr/bin/env bash
# points: 3
# desc: the Ingress was migrated to the v1 backend schema, host and rule intact
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual yaml "$(kubectl -n lynx get ingress reports -o yaml 2>/dev/null | k8s_clean)"
  show_expected yaml "/banks/${BANK:-ckad-mock-01}/q18/expected/ingress.yaml"
  show_why "$1"
}

class=$(kubectl -n lynx get ingress reports -o jsonpath='{.spec.ingressClassName}' 2>/dev/null)
[ "$class" = "nginx" ] || {
  echo "ingressClassName is '$class', want nginx"
  evidence "Choosing a controller moved from an annotation to a real field when Ingress went to v1: ingressClassName is where it lives now, and the old kubernetes.io/ingress.class annotation is deprecated and acted on by nothing here. An Ingress with no class is created quite happily and never admitted by any controller."
  exit 1
}

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
[ "$out" = "$want" ] && echo "ingress migrated" || {
  echo "rule is '$out', want '$want'"
  evidence "This is the part of the migration that is not a version bump. The old flat serviceName and servicePort became a nested backend.service with a name and a port that is either a number or a name; pathType gained no default and the object is rejected without it, so an Ingress that applied at all already has one — the question asks for Prefix. The host and the backend were to keep doing exactly what they did."
  exit 1
}
