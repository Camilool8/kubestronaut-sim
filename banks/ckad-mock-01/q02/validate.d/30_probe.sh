#!/usr/bin/env bash
# points: 3
# desc: readinessProbe httpGet / :80, initialDelay 5, period 10
set -uo pipefail
# Selected by container name rather than by position: the seed names it
# `api` and the question does not ask for it to be renamed, so the name is
# the stable handle. A sidecar added ahead of it would silently move [0].
c='.spec.template.spec.containers[?(@.name=="api")].readinessProbe'
out=$(kubectl -n nova get deploy nova-api -o jsonpath="{${c}.httpGet.path} {${c}.httpGet.port} {${c}.initialDelaySeconds} {${c}.periodSeconds}" 2>/dev/null)
[ "$out" = "/ 80 5 10" ] && echo "probe ok" || { echo "probe fields: '$out'"; exit 1; }
