#!/usr/bin/env bash
# points: 4
# desc: ledger-api reads the key that exists and is ready; ledger-creds untouched
set -uo pipefail
. /banks/_lib/checks.sh
user=$(kubectl -n tucana get secret ledger-creds -o jsonpath='{.data.username}' 2>/dev/null | base64 -d 2>/dev/null)
pass=$(kubectl -n tucana get secret ledger-creds -o jsonpath='{.data.password}' 2>/dev/null | base64 -d 2>/dev/null)
keys=$(kubectl -n tucana get secret ledger-creds -o json 2>/dev/null | jq -r '.data | keys | sort | join(",")')
creds() {
  show_actual json "$(kubectl -n tucana get secret ledger-creds -o json 2>/dev/null | jq '{keys: (.data // {} | keys)}')"
  show_why "$1"
}

[ "$user" = "ledger" ] && [ "$pass" = "Qx7-plasma-42" ] || {
  echo "ledger-creds was modified (username='$user')"
  creds "The question rules this out explicitly: the key ledger-creds already holds is the correct one, and the Deployment is the thing that was wrong. Changing the Secret to match the Deployment also makes the Pod start, and answers a question nobody asked — in a real cluster the Secret is usually the part you do not own."
  exit 1
}
[ "$keys" = "password,username" ] || {
  echo "ledger-creds gained or lost keys: '$keys'"
  creds "The Secret has gained or lost an entry. Adding the key the Deployment was asking for is the tempting shortcut and it is the one the question forbids: it fixes the symptom by moving the mistake into the object that was already right."
  exit 1
}

key=$(kubectl -n tucana get deploy ledger-api -o json 2>/dev/null \
  | jq -r '[.spec.template.spec.containers[].env[]? | select(.valueFrom.secretKeyRef.name == "ledger-creds") | .valueFrom.secretKeyRef.key] | first // ""')
[ "$key" = "password" ] || {
  echo "the Deployment still asks for key '$key', want 'password'"
  show_actual json "$(kubectl -n tucana get deploy ledger-api -o json 2>/dev/null | jq '[.spec.template.spec.containers[] | {name, env}]')"
  show_why "A secretKeyRef names both the Secret and the KEY inside it, and the key here does not exist. That is what CreateContainerConfigError means: the kubelet could not assemble the container's configuration, so no container ever started — which is also why kubectl logs has nothing to show and describe is where the reason is written."
  exit 1
}

ready=$(kubectl -n tucana get deploy ledger-api -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "$ready" = "1" ] && echo "deployment fixed and ready" || {
  echo "readyReplicas is '$ready', want 1"
  show_actual text "$(kubectl -n tucana get pod 2>/dev/null)"
  show_why "The environment variable now resolves, but no Pod is ready. Editing a Deployment's Pod template starts a new rollout, so an old Pod stuck in CreateContainerConfigError can still be sitting beside a new healthy one for a moment — and a mount added in the same edit is the other thing that can hold the new Pod back."
  exit 1
}
