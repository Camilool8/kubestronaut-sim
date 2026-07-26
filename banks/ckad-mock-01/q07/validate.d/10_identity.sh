#!/usr/bin/env bash
# points: 2
# desc: runs as uid 10001 / gid 20001 and is refused if the image would run as root
set -uo pipefail
# Accept the settings at either level: securityContext fields set on the
# Pod apply to every container unless the container overrides them, and
# both placements are correct answers.
get() {
  local field=$1 v
  v=$(kubectl -n cygnus get pod vault-agent \
    -o jsonpath="{.spec.containers[?(@.name==\"agent\")].securityContext.${field}}" 2>/dev/null)
  [ -n "$v" ] || v=$(kubectl -n cygnus get pod vault-agent \
    -o jsonpath="{.spec.securityContext.${field}}" 2>/dev/null)
  printf '%s' "$v"
}
uid=$(get runAsUser); gid=$(get runAsGroup); nonroot=$(get runAsNonRoot)
[ "$uid" = "10001" ] || { echo "runAsUser='$uid', want 10001"; exit 1; }
[ "$gid" = "20001" ] || { echo "runAsGroup='$gid', want 20001"; exit 1; }
[ "$nonroot" = "true" ] || { echo "runAsNonRoot='$nonroot', want true"; exit 1; }
echo "identity ok"
