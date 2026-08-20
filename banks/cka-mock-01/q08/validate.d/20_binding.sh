#!/usr/bin/env bash
# points: 2
# desc: ServiceAccount ci-bot exists and ci-bot-deployer binds Role ci-deployer to it
set -uo pipefail
. /banks/_lib/checks.sh

NS=pavo

sas=$(kubectl -n "$NS" get serviceaccount -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)
rb=$(kubectl -n "$NS" get rolebinding ci-bot-deployer -o json 2>/dev/null)

sa_pane() {
  show_actual text "$(kubectl -n "$NS" get serviceaccount 2>/dev/null)"
  show_why "$1"
}
rb_pane() {
  show_actual json "$(printf '%s' "$rb" | jq '{roleRef, subjects}' 2>/dev/null)"
  show_why "$1"
}
pane=''

binds_correctly() {
  printf '%s' "$rb" | jq -e '.roleRef.kind == "Role" and .roleRef.name == "ci-deployer"
      and ([.subjects[]? | select(.kind == "ServiceAccount" and .name == "ci-bot"
            and (.namespace // "pavo") == "pavo")] | length) > 0' >/dev/null 2>&1
}

crit 1 "ServiceAccount ci-bot exists in pavo" \
  "no ServiceAccount named ci-bot in $NS (found: $(name_list "$sas"))" \
  "A ServiceAccount is the identity a workload presents to the API server, and it is namespaced. RBAC matches the string system:serviceaccount:pavo:ci-bot rather than the object, so a binding can name an account that was never created and still be accepted — which is why the account has to be checked for separately rather than inferred from a working binding." \
  -- has_name "$sas" "ci-bot" || pane=${pane:-sa_pane}

crit 1 "ci-bot-deployer binds ci-deployer to that account" \
  "RoleBinding ci-bot-deployer does not bind Role ci-deployer to ci-bot" \
  "A RoleBinding joins one roleRef to a list of subjects and both halves have to be right: roleRef.kind must be Role for a Role of this name to resolve, since ClusterRole with the same name is a different object, and a ServiceAccount subject carries its own namespace field. An empty pane means no RoleBinding of that name exists in pavo — and a Role that nothing binds grants nobody anything at all." \
  -- binds_correctly || pane=${pane:-rb_pane}

crit_all_passed || "${pane:-rb_pane}" "$(crit_why)"
report "binding in place"
