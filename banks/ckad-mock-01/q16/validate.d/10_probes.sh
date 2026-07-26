#!/usr/bin/env bash
# points: 5
# desc: startup, readiness and liveness probes with the requested settings
set -uo pipefail
spec=$(kubectl -n hydra get deploy orders-api -o json 2>/dev/null \
  | jq -r '.spec.template.spec.containers[0]')
[ -n "$spec" ] && [ "$spec" != "null" ] || { echo "cannot read the orders-api container"; exit 1; }

# Assert only on the fields the question names. Anything else the API
# fills in — failureThreshold defaults to 3, timeoutSeconds to 1,
# successThreshold to 1 — comes back set whether or not the candidate
# wrote it, so demanding it be absent fails a correct answer.
field() {
  printf '%s' "$spec" | jq -r --arg p "$1" --arg f "$2" '(.[$p] // {}) | getpath($f | split(".")) // "-"'
}
want() {
  local probe=$1 path=$2 expect=$3 got
  got=$(field "$probe" "$path")
  [ "$got" = "$expect" ] && return 0
  echo "${probe}.${path} is '${got}', want '${expect}'"
  return 1
}

fail=0
want startupProbe httpGet.path / || fail=1
want startupProbe httpGet.port 80 || fail=1
want startupProbe periodSeconds 2 || fail=1
want startupProbe failureThreshold 30 || fail=1

want readinessProbe httpGet.path / || fail=1
want readinessProbe httpGet.port 80 || fail=1
want readinessProbe periodSeconds 5 || fail=1
want readinessProbe failureThreshold 2 || fail=1

want livenessProbe httpGet.path / || fail=1
want livenessProbe httpGet.port 80 || fail=1
want livenessProbe initialDelaySeconds 10 || fail=1
want livenessProbe periodSeconds 10 || fail=1

[ "$fail" = "0" ] && echo "all three probes ok" || exit 1
