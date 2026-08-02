#!/usr/bin/env bash
# points: 3
# desc: Pod tuned takes every app-tuning entry via envFrom, not one by one
set -uo pipefail
. /banks/_lib/checks.sh
ref=$(kubectl -n atlas get pod tuned \
  -o jsonpath='{.spec.containers[?(@.name=="web")].envFrom[*].configMapRef.name}' 2>/dev/null)
printf '%s' "$ref" | grep -qw app-tuning || {
  echo "container 'web' has no envFrom for app-tuning (got '$ref')"
  show_actual json "$(kubectl -n atlas get pod tuned -o json 2>/dev/null | jq '.spec.containers[] | select(.name == "web") | {envFrom, env}')"
  show_why "envFrom imports EVERY key of the ConfigMap as an environment variable named after the key, which is what 'without listing them one by one' asks for. Naming each key with env.valueFrom.configMapKeyRef delivers the same two values today and stops importing anything the ConfigMap gains tomorrow. A Pod's containers are immutable once created, so this is a field that has to be right before the Pod is applied."
  exit 1
}
echo "envFrom ok"
