#!/usr/bin/env bash
# points: 4
# desc: startup, readiness and liveness probes with the requested settings
set -uo pipefail
. /banks/_lib/checks.sh
spec=$(kubectl -n hydra get deploy orders-api -o json 2>/dev/null \
  | jq -r '.spec.template.spec.containers[] | select(.name == "api")')
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

[ "$fail" = "0" ] && { echo "all three probes ok"; exit 0; }

# Twelve `want` lines can print a dozen mismatches, and a list of a dozen
# mismatches is not a picture of anything. The three probe objects side
# by side are — including the ones that came back `null`, which is what a
# candidate who added two of the three needs to see.
#
# JSON here, not YAML, and no k8s_clean: this is a fragment of a Pod
# template rather than an API object, so there is no server-side
# bookkeeping to strip and jq already emits it. expected/probes.json was
# produced by running this same jq against a cluster the reference
# solution had been applied to.
show_actual json "$(printf '%s' "$spec" | jq '{startupProbe, readinessProbe, livenessProbe}')"
show_expected json "/banks/${BANK:-ckad-mock-01}/q16/expected/probes.json"
show_why "The three probes answer three different questions: startupProbe is the grace period before the other two apply, readinessProbe decides whether the Pod is in the Service's endpoint list, and livenessProbe restarts the container. Fields the question does not name (timeoutSeconds, successThreshold) are defaulted by the API server and are not being graded."
exit 1
