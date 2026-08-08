#!/usr/bin/env bash
# points: 2
# desc: /opt/course/29/existing-toggle names the resource that was already in sextans
set -uo pipefail
. /banks/_lib/checks.sh

f=/opt/course/29/existing-toggle
want=legacy-checkout
got=$(file_text "$f")
[ -n "$got" ] || {
  echo "$f is missing or empty"
  show_why "Nothing was written to that path. Once the type is registered it lists like any other namespaced resource, so finding what is already there is a plain get in the Namespace the question named."
  exit 1
}
[ "$got" = "$want" ] && echo "existing resource recorded" || {
  echo "$f holds '$got', want the name of the resource already in sextans"
  show_actual json "$(kubectl get --raw /apis/flags.kubestronaut.dev/v1alpha1/namespaces/sextans/featuretoggles 2>/dev/null | jq '[.items[].metadata.name]' 2>/dev/null)"
  show_why "The pane lists the names that exist in sextans now. The one asked for is the resource that was there before you created anything — the name only, without the kind in front of it and without the one you added."
  exit 1
}
