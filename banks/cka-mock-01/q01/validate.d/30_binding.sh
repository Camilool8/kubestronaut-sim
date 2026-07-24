#!/usr/bin/env bash
# points: 2
# desc: RoleBinding deploy-bot-binding binds deployment-manager to deploy-bot
set -uo pipefail
out=$(kubectl -n cka-rbac get rolebinding deploy-bot-binding \
  -o jsonpath='{.roleRef.kind}/{.roleRef.name} {.subjects[0].kind}/{.subjects[0].namespace}/{.subjects[0].name}' 2>/dev/null)
[ "$out" = "Role/deployment-manager ServiceAccount/cka-rbac/deploy-bot" ] \
  && echo "binding ok" || { echo "binding wrong or missing (got: '$out')"; exit 1; }
