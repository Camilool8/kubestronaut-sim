#!/usr/bin/env bash
# points: 3
# desc: startup, readiness and liveness probes with the requested settings
set -uo pipefail
. /banks/_lib/checks.sh
spec=$(kubectl -n hydra get deploy orders-api -o json 2>/dev/null \
  | jq -r '.spec.template.spec.containers[] | select(.name == "api")')
[ -n "$spec" ] && [ "$spec" != "null" ] || { echo "cannot read the orders-api container"; exit 1; }

field() {
  printf '%s' "$spec" | jq -r --arg p "$1" --arg f "$2" '(.[$p] // {}) | getpath($f | split(".")) // "-"'
}
# Twelve fields across three probes, each scored on its own. All-or-nothing here
# was the harshest case in the bank: two wrong numbers out of twelve — probes
# present, both replicas ready, the Service serving — scored the same as no
# probes at all.
want() {
  local probe=$1 path=$2 expect=$3 got
  got=$(field "$probe" "$path")
  crit 1 "${probe}.${path} is ${expect}" \
    "${probe}.${path} is '${got}', want '${expect}'" \
    -- [ "$got" = "$expect" ]
}

want startupProbe httpGet.path /
want startupProbe httpGet.port 80
want startupProbe periodSeconds 2
want startupProbe failureThreshold 30

want readinessProbe httpGet.path /
want readinessProbe httpGet.port 80
want readinessProbe periodSeconds 5
want readinessProbe failureThreshold 2

want livenessProbe httpGet.path /
want livenessProbe httpGet.port 80
want livenessProbe initialDelaySeconds 10
want livenessProbe periodSeconds 10

crit_all_passed || {
  show_actual json "$(printf '%s' "$spec" | jq '{startupProbe, readinessProbe, livenessProbe}')"
  show_expected json "/banks/${BANK:-ckad-mock-01}/q16/expected/probes.json"
  show_why "The three probes answer three different questions: startupProbe is the grace period before the other two apply, readinessProbe decides whether the Pod is in the Service's endpoint list, and livenessProbe restarts the container. Fields the question does not name (timeoutSeconds, successThreshold) are defaulted by the API server and are not being graded."
}
report "all three probes ok"
