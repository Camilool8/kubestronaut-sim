#!/usr/bin/env bash
# points: 3
# desc: readinessProbe httpGet / :80, initialDelay 5, period 10
# expected: probe.json json
set -uo pipefail
. /banks/_lib/checks.sh
c='.spec.template.spec.containers[?(@.name=="api")].readinessProbe'

snapshot() {
  kubectl -n nova get deploy nova-api -o json 2>/dev/null \
    | jq -S '(first(.spec.template.spec.containers[]? | select(.name=="api")) // {}) | {readinessProbe: (.readinessProbe // null)}'
}

evidence() {
  show_pair json probe.json
  show_why "$1"
}

names=$(kubectl -n nova get deploy nova-api -o jsonpath='{.spec.template.spec.containers[*].name}' 2>/dev/null)
has_name "$names" api || {
  echo "no container named 'api' in deploy/nova-api (found: $(name_list "$names"))"
  show_actual text "containers that exist: $(name_list "$names")"
  show_why "The readinessProbe this check grades belongs to the container named api in the Pod template of Deployment nova-api, Namespace nova. An empty pane means no such Deployment exists; any other name means the container was renamed, which this question never asked for."
  exit 1
}

out=$(kubectl -n nova get deploy nova-api -o jsonpath="{${c}.httpGet.path} {${c}.httpGet.port} {${c}.initialDelaySeconds} {${c}.periodSeconds}" 2>/dev/null)
[ "$out" = "/ 80 5 10" ] && echo "probe ok" || {
  echo "probe fields: '$out'"
  evidence "A readinessProbe decides whether the Pod is put into a Service's endpoint list; unlike a liveness probe it never restarts anything. The four fields the question names are the path, the port, how long to wait before probing at all and how often to repeat — everything else the API filled in by itself (timeoutSeconds, successThreshold, failureThreshold) is not graded."
  exit 1
}
