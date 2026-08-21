#!/usr/bin/env bash
# points: 1
# desc: rollingUpdate maxSurge=1 maxUnavailable=0
# expected: strategy.json json
set -uo pipefail
. /banks/_lib/checks.sh

snapshot() {
  kubectl -n nova get deploy nova-api -o json 2>/dev/null \
    | jq -S '{maxSurge: (.spec.strategy.rollingUpdate.maxSurge // null), maxUnavailable: (.spec.strategy.rollingUpdate.maxUnavailable // null)}'
}

evidence() {
  show_pair json strategy.json
  show_why "$1"
}

exists=$(kubectl -n nova get deploy nova-api -o jsonpath='{.metadata.name}' 2>/dev/null)
[ -n "$exists" ] || {
  echo "Deployment nova-api not found in Namespace nova"
  show_actual text "$(kubectl -n nova get deploy 2>/dev/null)"
  show_why "Every part of this question is graded on Deployment nova-api in Namespace nova, and the pane above lists what that Namespace actually holds. A Deployment created under another name is invisible to every check here."
  exit 1
}

out=$(kubectl -n nova get deploy nova-api -o jsonpath='{.spec.strategy.rollingUpdate.maxSurge} {.spec.strategy.rollingUpdate.maxUnavailable}' 2>/dev/null)
[ "$out" = "1 0" ] && echo "strategy ok" || {
  echo "strategy: '$out'"
  evidence "Both fields live under spec.strategy.rollingUpdate and only apply while spec.strategy.type is RollingUpdate — under Recreate every Pod is deleted before any replacement starts. maxUnavailable: 0 is what forbids an update from ever dropping below the current number of available replicas, and maxSurge: 1 is what gives the rollout room to start the replacement first. Set both to 0 and the rollout can never make progress."
  exit 1
}
