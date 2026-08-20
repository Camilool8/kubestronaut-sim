#!/usr/bin/env bash
# points: 2
# desc: the container's port 8080 is named http-web in Deployment pollux-web
set -uo pipefail
. /banks/_lib/checks.sh

deploy=$(kubectl -n gemini get deploy pollux-web -o json 2>/dev/null)

[ -n "$deploy" ] || {
  echo "no Deployment named pollux-web in namespace gemini"
  show_actual text "$(kubectl -n gemini get deploy 2>/dev/null)"
  show_why "The question names the Deployment it wants edited, and the name is how everything else finds it — the Service's selector, kubectl rollout, and this check. Nothing under that name exists in gemini, so either the edit went somewhere else or the Deployment was replaced under another name."
  exit 1
}

# The name has to sit on the port the container really listens on: a name
# attached to some other entry resolves to some other number.
named=$(printf '%s' "$deploy" | jq -r \
  '[.spec.template.spec.containers[]?.ports[]? | select(.containerPort == 8080) | .name // empty] | join(" ")')
declared=$(printf '%s' "$deploy" | jq -r \
  '[.spec.template.spec.containers[]?.ports[]? | "\(.name // "<unnamed>"):\(.containerPort)"] | join(" ")')

crit 1 "the container port 8080 is named http-web" \
  "the Pod template declares $(name_list "$declared") as name:port, want http-web on 8080" \
  "A named targetPort on the Service side is resolved per Pod against the names in that Pod's containers[].ports, so the name has to exist there first — and on the entry carrying 8080, since the name is only a label for that number. Adding it rewrites the Pod template, which rolls the Deployment: the running Pods are replaced, and only the new ones carry the name." \
  -- has_name "$named" http-web

crit_all_passed || {
  show_actual json "$(printf '%s' "$deploy" | jq '[.spec.template.spec.containers[]? | {name, ports}]')"
  show_why "$(crit_why)"
}
report "container port named"
