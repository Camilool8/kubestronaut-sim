#!/usr/bin/env bash
# points: 3
# desc: payments-api takes DB_ENDPOINT from a key that exists in ConfigMap payments-config
# expected: db-endpoint.json json
set -uo pipefail
. /banks/_lib/checks.sh

deploys=$(kubectl -n lyra get deploy -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)
has_name "$deploys" payments-api || {
  echo "no Deployment named payments-api in lyra (found: $(name_list "$deploys"))"
  show_actual text "$(kubectl -n lyra get deploy,cm 2>/dev/null)"
  show_why "The task was to repair the Deployment that is already there, and it is graded under the name the question pinned: payments-api. A replacement built alongside it, or in place of it, under any other name is a different object, and the one the question named is the one every check here looks for."
  exit 1
}

d=$(kubectl -n lyra get deploy payments-api -o json 2>/dev/null)

snapshot() {
  printf '%s' "${d:-null}" | jq -S '{
    env_DB_ENDPOINT: (first(.spec.template.spec.containers[]?.env[]?
      | select(.name == "DB_ENDPOINT")) // null),
    envFrom_configMapRefs: ([ .spec.template.spec.containers[]?.envFrom[]?.configMapRef.name // empty ] | sort)
  }' 2>/dev/null
}

evidence() {
  show_pair json db-endpoint.json
  show_why "$1"
}

# The variable may be wired either way round: named explicitly with a
# configMapKeyRef, or imported wholesale with envFrom. Both take the value from
# the ConfigMap, which is what the question asks for, so both are read here —
# envFrom naming this ConfigMap delivers DB_ENDPOINT under the key of the same
# name.
ref_name=$(printf '%s' "$d" | jq -r 'first(.spec.template.spec.containers[]?.env[]?
  | select(.name == "DB_ENDPOINT")) | .valueFrom.configMapKeyRef.name // ""' 2>/dev/null)
ref_key=$(printf '%s' "$d" | jq -r 'first(.spec.template.spec.containers[]?.env[]?
  | select(.name == "DB_ENDPOINT")) | .valueFrom.configMapKeyRef.key // ""' 2>/dev/null)
imported=$(printf '%s' "$d" | jq -r '[.spec.template.spec.containers[]?.envFrom[]?.configMapRef.name // empty]
  | join(" ")' 2>/dev/null)

if [ -z "$ref_name" ] && has_name "$imported" payments-config; then
  ref_name=payments-config
  ref_key=DB_ENDPOINT
fi

cm=$(kubectl -n lyra get cm payments-config -o json 2>/dev/null)
cm_keys=$(printf '%s' "$cm" | jq -r '(.data // {}) | keys | join(", ")' 2>/dev/null)

[ "$ref_name" = "payments-config" ] || {
  echo "DB_ENDPOINT is not taken from ConfigMap payments-config (it references '$ref_name')"
  evidence "The endpoint is configuration, and the question keeps it in the ConfigMap payments-config: the Pod template has to reference it, with a configMapKeyRef naming a key of that ConfigMap or with an envFrom importing the whole of it. Writing the address straight into the template as a literal value makes the container start, but it also copies a value that the ConfigMap is meant to own, so the next change to the ConfigMap no longer reaches the app. An empty reference here means no environment variable called DB_ENDPOINT is defined from that ConfigMap at all."
  exit 1
}

printf '%s' "$cm" | jq -e --arg k "$ref_key" '(.data // {}) | has($k)' >/dev/null 2>&1 || {
  echo "DB_ENDPOINT references key '$ref_key', which payments-config does not have (its keys: ${cm_keys:-none})"
  evidence "This is the whole failure. A configMapKeyRef marked optional does not stop the container from starting when its key is missing — the kubelet simply leaves the variable unset, which is why the Pod reaches CrashLoopBackOff with the app's own error in its logs instead of stopping at CreateContainerConfigError before the container ever runs. The key named in the reference has to be one the ConfigMap actually holds: either point the reference at the key that is already there, or add the key it asks for. Key names are case-sensitive and a hyphen is not an underscore."
  exit 1
}

echo "DB_ENDPOINT wired to payments-config key $ref_key"
