#!/usr/bin/env bash
# points: 2
# desc: Role deployment-manager grants exactly get,list,watch,create,update,patch on apps/deployments
set -uo pipefail
rules=$(kubectl -n cka-rbac get role deployment-manager -o jsonpath='{range .rules[*]}{.apiGroups[*]}|{.resources[*]}|{.verbs[*]}{"\n"}{end}' 2>/dev/null)
[ -n "$rules" ] || { echo "role missing"; exit 1; }
match=$(printf '%s\n' "$rules" | awk -F'|' '
  $1 == "apps" && $2 == "deployments" {
    n = split($3, v, " "); if (n != 6) next
    ok = 1
    for (i = 1; i <= n; i++)
      if (v[i] !~ /^(get|list|watch|create|update|patch)$/) ok = 0
    if (ok) print "yes"
  }')
[ "$match" = "yes" ] && echo "role rules ok" \
  || { echo "role rules wrong (got: $rules)"; exit 1; }
