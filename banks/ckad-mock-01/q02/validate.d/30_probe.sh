#!/usr/bin/env bash
# points: 3
# desc: readinessProbe httpGet / :80, initialDelay 5, period 10
set -uo pipefail
. /banks/_lib/checks.sh
c='.spec.template.spec.containers[?(@.name=="api")].readinessProbe'
out=$(kubectl -n nova get deploy nova-api -o jsonpath="{${c}.httpGet.path} {${c}.httpGet.port} {${c}.initialDelaySeconds} {${c}.periodSeconds}" 2>/dev/null)
[ "$out" = "/ 80 5 10" ] && echo "probe ok" || {
  echo "probe fields: '$out'"
  show_actual json "$(kubectl -n nova get deploy nova-api -o json 2>/dev/null | jq --arg c api '
    if any(.spec.template.spec.containers[]; .name == $c)
    then first(.spec.template.spec.containers[] | select(.name == $c)) | {readinessProbe}
    else {"no such container": $c, "containers that exist": [.spec.template.spec.containers[].name]}
    end')"
  show_why "A readinessProbe decides whether the Pod is put into a Service's endpoint list; unlike a liveness probe it never restarts anything. The four fields the question names are the path, the port, how long to wait before probing at all and how often to repeat — everything else the API filled in by itself (timeoutSeconds, successThreshold, failureThreshold) is not graded. A null pane means no readinessProbe reached the container."
  exit 1
}
