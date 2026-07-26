#!/usr/bin/env bash
# points: 1
# desc: Pod telemetry runs containers app and adapter on busybox:1.37
set -uo pipefail
names=$(kubectl -n pictor get pod telemetry \
  -o jsonpath='{range .spec.containers[*]}{.name}{"\n"}{end}' 2>/dev/null | sort | tr '\n' ' ')
names=${names% }
[ "$names" = "adapter app" ] || { echo "containers are '$names', want 'app' and 'adapter'"; exit 1; }

for c in app adapter; do
  img=$(kubectl -n pictor get pod telemetry \
    -o jsonpath="{.spec.containers[?(@.name==\"${c}\")].image}" 2>/dev/null)
  [ "$img" = "busybox:1.37" ] || { echo "container ${c} uses image '$img', want busybox:1.37"; exit 1; }
done

phase=$(kubectl -n pictor get pod telemetry -o jsonpath='{.status.phase}' 2>/dev/null)
[ "$phase" = "Running" ] \
  && echo "containers ok" \
  || { echo "pod phase is '$phase', want Running"; exit 1; }
