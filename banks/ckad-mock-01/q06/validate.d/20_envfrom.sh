#!/usr/bin/env bash
# points: 3
# desc: Pod tuned takes every app-tuning entry via envFrom, not one by one
set -uo pipefail
. /banks/_lib/checks.sh
actual() {
  show_actual json "$(kubectl -n atlas get pod tuned -o json 2>/dev/null | jq --arg c web '
    if any(.spec.containers[]; .name == $c)
    then first(.spec.containers[] | select(.name == $c)) | {envFrom, env}
    else {"no such container": $c, "containers that exist": [.spec.containers[].name]}
    end')"
}

names=$(kubectl -n atlas get pod tuned -o jsonpath='{.spec.containers[*].name}' 2>/dev/null)
has_name "$names" web || {
  echo "pod tuned has no container named 'web' (found: $(name_list "$names"))"
  actual
  show_why "The question names the container 'web'. Generating a Pod from the command line names its container after the Pod unless told otherwise, which is the usual reason this reads back as a Pod whose single container is called 'tuned'. envFrom is graded on the named container, so under any other name it is not seen at all."
  exit 1
}

ref=$(kubectl -n atlas get pod tuned \
  -o jsonpath='{.spec.containers[?(@.name=="web")].envFrom[*].configMapRef.name}' 2>/dev/null)
has_name "$ref" app-tuning || {
  echo "container 'web' has no envFrom for app-tuning (got '$ref')"
  actual
  show_why "envFrom imports EVERY key of the ConfigMap as an environment variable named after the key, which is what 'without listing them one by one' asks for. Naming each key with env.valueFrom.configMapKeyRef delivers the same two values today and stops importing anything the ConfigMap gains tomorrow. A Pod's containers are immutable once created, so this is a field that has to be right before the Pod is applied."
  exit 1
}
echo "envFrom ok"
