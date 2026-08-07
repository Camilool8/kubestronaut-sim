#!/usr/bin/env bash
# points: 3
# desc: no privilege escalation, read-only root filesystem, all capabilities dropped
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual json "$(kubectl -n cygnus get pod vault-agent -o json 2>/dev/null | jq --arg c agent '
    if any(.spec.containers[]; .name == $c)
    then first(.spec.containers[] | select(.name == $c)) | .securityContext
    else {"no such container": $c, "containers that exist": [.spec.containers[].name]}
    end')"
  show_expected json "/banks/${BANK:-ckad-mock-01}/q07/expected/securitycontext.json"
  show_why "$1"
}

names=$(kubectl -n cygnus get pod vault-agent -o jsonpath='{.spec.containers[*].name}' 2>/dev/null)
has_name "$names" agent || {
  echo "pod vault-agent has no container named 'agent' (found: $(name_list "$names"))"
  evidence "The hardening fields are read off the container the question names. Under any other name they are not consulted at all, so each one reads back empty however carefully it was set."
  exit 1
}

sel='{.spec.containers[?(@.name=="agent")].securityContext'
esc=$(kubectl -n cygnus get pod vault-agent -o jsonpath="${sel}.allowPrivilegeEscalation}" 2>/dev/null)
ro=$(kubectl -n cygnus get pod vault-agent -o jsonpath="${sel}.readOnlyRootFilesystem}" 2>/dev/null)
drops=$(kubectl -n cygnus get pod vault-agent -o jsonpath="${sel}.capabilities.drop[*]}" 2>/dev/null)

crit 1 "cannot gain more privileges" \
  "allowPrivilegeEscalation='$esc', want false" -- [ "$esc" = "false" ]
crit 1 "read-only root filesystem" \
  "readOnlyRootFilesystem='$ro', want true"     -- [ "$ro" = "true" ]
crit 1 "drops all Linux capabilities" \
  "capabilities.drop is '$drops', want ALL"     -- has_name "$drops" ALL

crit_all_passed || evidence "All three live ONLY on the container securityContext — written at Pod level the API rejects them, which is the usual reason one is missing. allowPrivilegeEscalation: false sets the kernel's no_new_privs bit, so a setuid binary inside the image stops being a way up. readOnlyRootFilesystem: true means nothing can be dropped into the container's own filesystem at runtime; an image that needs a writable path gets an emptyDir mounted over exactly that path rather than the whole root filesystem back. Dropping ALL capabilities strips the default set a container gets even when it is not root, and ALL is spelled in capitals — the API does not accept 'all'."
report "hardening ok"
