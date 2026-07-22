#!/usr/bin/env bash
# points: 2
# desc: readinessProbe httpGet / :80, initialDelay 5, period 10
set -uo pipefail
out=$(kubectl -n nova get deploy nova-api -o jsonpath='{.spec.template.spec.containers[0].readinessProbe.httpGet.path} {.spec.template.spec.containers[0].readinessProbe.httpGet.port} {.spec.template.spec.containers[0].readinessProbe.initialDelaySeconds} {.spec.template.spec.containers[0].readinessProbe.periodSeconds}' 2>/dev/null)
[ "$out" = "/ 80 5 10" ] && echo "probe ok" || { echo "probe fields: '$out'"; exit 1; }
