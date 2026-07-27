#!/usr/bin/env bash
# points: 4
# desc: ledger-api reads the key that exists and is ready; ledger-creds untouched
set -uo pipefail
# The Secret must still hold what it was seeded with. Editing the Secret
# to add a DB_PASSWORD key would also make the Pod start, and the
# question explicitly rules it out — the Deployment is what was wrong.
user=$(kubectl -n tucana get secret ledger-creds -o jsonpath='{.data.username}' 2>/dev/null | base64 -d 2>/dev/null)
pass=$(kubectl -n tucana get secret ledger-creds -o jsonpath='{.data.password}' 2>/dev/null | base64 -d 2>/dev/null)
keys=$(kubectl -n tucana get secret ledger-creds -o json 2>/dev/null | jq -r '.data | keys | sort | join(",")')
[ "$user" = "ledger" ] && [ "$pass" = "Qx7-plasma-42" ] \
  || { echo "ledger-creds was modified (username='$user')"; exit 1; }
[ "$keys" = "password,username" ] \
  || { echo "ledger-creds gained or lost keys: '$keys'"; exit 1; }

key=$(kubectl -n tucana get deploy ledger-api -o json 2>/dev/null \
  | jq -r '[.spec.template.spec.containers[].env[]? | select(.valueFrom.secretKeyRef.name == "ledger-creds") | .valueFrom.secretKeyRef.key] | first // ""')
[ "$key" = "password" ] || { echo "the Deployment still asks for key '$key', want 'password'"; exit 1; }

ready=$(kubectl -n tucana get deploy ledger-api -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "$ready" = "1" ] \
  && echo "deployment fixed and ready" \
  || { echo "readyReplicas is '$ready', want 1"; exit 1; }
