#!/usr/bin/env bash
# points: 2
# desc: an emptyDir named telemetry is mounted at /var/run/telemetry in both containers
set -uo pipefail
kind=$(kubectl -n pictor get pod telemetry \
  -o jsonpath='{.spec.volumes[?(@.name=="telemetry")].emptyDir}' 2>/dev/null)
[ -n "$kind" ] || { echo "no emptyDir volume named telemetry"; exit 1; }

for c in app adapter; do
  path=$(kubectl -n pictor get pod telemetry \
    -o jsonpath="{.spec.containers[?(@.name==\"${c}\")].volumeMounts[?(@.name==\"telemetry\")].mountPath}" 2>/dev/null)
  [ "$path" = "/var/run/telemetry" ] \
    || { echo "container ${c} mounts telemetry at '$path', want /var/run/telemetry"; exit 1; }
done
echo "shared volume ok"
