#!/usr/bin/env bash
# points: 3
# desc: readinessProbe httpGet / :80, initialDelay 5, period 10
set -uo pipefail
. /banks/_lib/checks.sh
# Selected by container name rather than by position: the seed names it
# `api` and the question does not ask for it to be renamed, so the name is
# the stable handle. A sidecar added ahead of it would silently move [0].
c='.spec.template.spec.containers[?(@.name=="api")].readinessProbe'
out=$(kubectl -n nova get deploy nova-api -o jsonpath="{${c}.httpGet.path} {${c}.httpGet.port} {${c}.initialDelaySeconds} {${c}.periodSeconds}" 2>/dev/null)
[ "$out" = "/ 80 5 10" ] && echo "probe ok" || {
  echo "probe fields: '$out'"
  show_actual json "$(kubectl -n nova get deploy nova-api -o json 2>/dev/null | jq '.spec.template.spec.containers[] | select(.name == "api") | {readinessProbe}')"
  show_why "A readinessProbe decides whether the Pod is put into a Service's endpoint list; unlike a liveness probe it never restarts anything. The four fields the question names are the path, the port, how long to wait before probing at all and how often to repeat — everything else the API filled in by itself (timeoutSeconds, successThreshold, failureThreshold) is not graded. A null pane means no readinessProbe reached the container."
  exit 1
}
