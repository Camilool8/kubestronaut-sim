#!/usr/bin/env bash
# points: 3
# desc: requests 100m/64Mi and limits 500m/128Mi
set -uo pipefail
sel='{.spec.containers[?(@.name=="agent")].resources'
rc=$(kubectl -n cygnus get pod vault-agent -o jsonpath="${sel}.requests.cpu}" 2>/dev/null)
rm=$(kubectl -n cygnus get pod vault-agent -o jsonpath="${sel}.requests.memory}" 2>/dev/null)
lc=$(kubectl -n cygnus get pod vault-agent -o jsonpath="${sel}.limits.cpu}" 2>/dev/null)
lm=$(kubectl -n cygnus get pod vault-agent -o jsonpath="${sel}.limits.memory}" 2>/dev/null)

# Quantities are compared by value, not by spelling: 0.1 and 100m are the
# same CPU request, and a candidate who wrote either answered correctly.
milli() {
  case "$1" in
    *m) printf '%s' "${1%m}" ;;
    "") printf '' ;;
    *) awk -v v="$1" 'BEGIN{printf "%d", v * 1000}' ;;
  esac
}
mib() {
  case "$1" in
    *Mi) printf '%s' "${1%Mi}" ;;
    *Gi) awk -v v="${1%Gi}" 'BEGIN{printf "%d", v * 1024}' ;;
    "") printf '' ;;
    *) printf 'x' ;;
  esac
}
[ "$(milli "$rc")" = "100" ] || { echo "cpu request is '$rc', want 100m"; exit 1; }
[ "$(milli "$lc")" = "500" ] || { echo "cpu limit is '$lc', want 500m"; exit 1; }
[ "$(mib "$rm")" = "64" ] || { echo "memory request is '$rm', want 64Mi"; exit 1; }
[ "$(mib "$lm")" = "128" ] || { echo "memory limit is '$lm', want 128Mi"; exit 1; }
echo "resources ok"
