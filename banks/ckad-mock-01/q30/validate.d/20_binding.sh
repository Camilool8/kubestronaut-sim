#!/usr/bin/env bash
# points: 2
# desc: ServiceAccount report-reader exists and report-reader-binding binds the Role to it
# expected: binding.json json
set -uo pipefail
. /banks/_lib/checks.sh

sas=$(kubectl -n crater get serviceaccount -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)
rb=$(kubectl -n crater get rolebinding report-reader-binding -o json 2>/dev/null)

# Only the RoleBinding half is a shape the candidate authored. Whether the
# ServiceAccount exists at all is a name-list reading — has_name against
# `kubectl get serviceaccount` — and rides on its own crit message instead;
# pairing it would mean generating a document that says nothing but
# "report-reader is here", which teaches nothing a diff can show.
snapshot() {
  printf '%s' "${rb:-null}" | jq -S '
    {roleRef: (.roleRef // null),
     subjects: ((.subjects // []) | sort_by(.kind, .name, (.namespace // "")))}
  ' 2>/dev/null
}

sa_pane() {
  show_actual text "$(kubectl -n crater get serviceaccount 2>/dev/null)"
  show_why "$1"
}
rb_pane() {
  show_pair json binding.json
  show_why "$1"
}
pane=''

binds_correctly() {
  printf '%s' "$rb" | jq -e '.roleRef.kind == "Role" and .roleRef.name == "configmap-reader"
      and ([.subjects[]? | select(.kind == "ServiceAccount" and .name == "report-reader"
            and (.namespace // "crater") == "crater")] | length) > 0' >/dev/null 2>&1
}

crit 1 "ServiceAccount report-reader exists in crater" \
  "no ServiceAccount named report-reader in crater (found: $(name_list "$sas"))" \
  "A ServiceAccount is the identity a workload presents to the API server, and it is namespaced. RBAC matches the string system:serviceaccount:crater:report-reader rather than the object, so a binding can name one that does not exist and still take effect — which is exactly what makes the leftover grant in this question possible." \
  -- has_name "$sas" "report-reader" || pane=${pane:-sa_pane}

crit 1 "report-reader-binding binds configmap-reader to that account" \
  "RoleBinding report-reader-binding does not bind Role configmap-reader to report-reader" \
  "A RoleBinding joins one roleRef to a list of subjects, and both halves have to be right: roleRef.kind must be Role rather than ClusterRole for a Role of this name to resolve, and a ServiceAccount subject carries its own namespace field. An empty pane means no RoleBinding of that name exists in crater." \
  -- binds_correctly || pane=${pane:-rb_pane}

crit_all_passed || "${pane:-rb_pane}" "$(crit_why)"
report "binding in place"
