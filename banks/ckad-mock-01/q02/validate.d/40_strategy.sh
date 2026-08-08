#!/usr/bin/env bash
# points: 1
# desc: rollingUpdate maxSurge=1 maxUnavailable=0
set -uo pipefail
. /banks/_lib/checks.sh
out=$(kubectl -n nova get deploy nova-api -o jsonpath='{.spec.strategy.rollingUpdate.maxSurge} {.spec.strategy.rollingUpdate.maxUnavailable}' 2>/dev/null)
[ "$out" = "1 0" ] && echo "strategy ok" || {
  echo "strategy: '$out'"
  show_actual json "$(kubectl -n nova get deploy nova-api -o json 2>/dev/null | jq '.spec.strategy')"
  show_why "Both fields live under spec.strategy.rollingUpdate and only apply while spec.strategy.type is RollingUpdate — under Recreate every Pod is deleted before any replacement starts. maxUnavailable: 0 is what forbids an update from ever dropping below the current number of available replicas, and maxSurge: 1 is what gives the rollout room to start the replacement first. Set both to 0 and the rollout can never make progress."
  exit 1
}
