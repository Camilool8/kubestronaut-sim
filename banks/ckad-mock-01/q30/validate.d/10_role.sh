#!/usr/bin/env bash
# points: 3
# desc: Role configmap-reader grants get, list and watch on core ConfigMaps only
set -uo pipefail
. /banks/_lib/checks.sh

role=$(kubectl -n crater get role configmap-reader -o json 2>/dev/null)
[ -n "$role" ] || {
  echo "Role configmap-reader not found in crater"
  show_actual text "$(kubectl -n crater get role 2>/dev/null)"
  show_why "A Role is namespaced and its rules only ever apply inside its own Namespace, so one of this name elsewhere grants nothing here. A ClusterRole of the same name is a different object again and would not be found by this lookup."
  exit 1
}

verbs=$(printf '%s' "$role" | jq -r '[.rules[]?.verbs[]?] | unique | join(" ")' 2>/dev/null)
res=$(printf '%s' "$role" | jq -r '[.rules[]?.resources[]?] | unique | join(" ")' 2>/dev/null)
groups=$(printf '%s' "$role" | jq -r '[.rules[]?.apiGroups[]?] | unique | map(if . == "" then "(core)" else . end) | join(" ")' 2>/dev/null)

evidence() {
  show_actual json "$(printf '%s' "$role" | jq '.rules' 2>/dev/null)"
  show_why "$1"
}

verbs_ok() {
  printf '%s' "$role" | jq -e '([.rules[]?.verbs[]?] | unique) == ["get","list","watch"]' >/dev/null 2>&1
}
target_ok() {
  printf '%s' "$role" | jq -e '([.rules[]?.resources[]?] | unique) == ["configmaps"]
      and ([.rules[]?.apiGroups[]?] | unique) == [""]' >/dev/null 2>&1
}

crit 2 "the verbs are exactly get, list and watch" \
  "the Role allows verbs [$verbs], want exactly get, list and watch" \
  "RBAC is additive and has no deny rule, so 'and nothing else' is expressed by leaving verbs out rather than by forbidding them. A wildcard verb, or the update and patch that a copied read-write rule brings along, is extra access nothing later takes back." \
  -- verbs_ok

crit 1 "it covers configmaps in the core API group and nothing else" \
  "the Role covers resources [$res] in groups [$groups], want configmaps in the core group" \
  "The empty string in apiGroups is the CORE group, which is where ConfigMaps, Secrets, Pods and Services live — it reads like an omission and is not one. Naming a second resource here, secrets most often, widens the grant past what the job needs." \
  -- target_ok

crit_all_passed || evidence "$(crit_why)"
report "role scoped correctly"
