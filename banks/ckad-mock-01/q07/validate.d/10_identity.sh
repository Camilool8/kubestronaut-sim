#!/usr/bin/env bash
# points: 2
# desc: runs as uid 10001 / gid 20001 and is refused if the image would run as root
# expected: identity.json json
set -uo pipefail
. /banks/_lib/checks.sh

# The fields below are read out of the container the question names. Nothing
# matching that name reads exactly like nothing being set, so say which it is
# before reporting a field as empty.
names=$(kubectl -n cygnus get pod vault-agent -o jsonpath='{.spec.containers[*].name}' 2>/dev/null)
has_name "$names" agent || {
  echo "pod vault-agent has no container named 'agent' (found: $(name_list "$names"))"
  show_actual text "containers that exist: $(name_list "$names")"
  show_why "Every securityContext field below is read off the container the question names. A container under a different name is a different container to the API, so the settings you put on it are not consulted and each field reads back empty — which is what the rest of this check would otherwise report."
  exit 1
}

get() {
  local field=$1 v
  v=$(kubectl -n cygnus get pod vault-agent \
    -o jsonpath="{.spec.containers[?(@.name==\"agent\")].securityContext.${field}}" 2>/dev/null)
  [ -n "$v" ] || v=$(kubectl -n cygnus get pod vault-agent \
    -o jsonpath="{.spec.securityContext.${field}}" 2>/dev/null)
  printf '%s' "$v"
}
uid=$(get runAsUser); gid=$(get runAsGroup); nonroot=$(get runAsNonRoot)

snapshot() {
  jq -n -S \
    --arg uid "${uid:-}" --arg gid "${gid:-}" --arg nonroot "${nonroot:-}" \
    '{
      runAsUser: (if $uid == "" then null else ($uid | tonumber) end),
      runAsGroup: (if $gid == "" then null else ($gid | tonumber) end),
      runAsNonRoot: (if $nonroot == "" then null elif $nonroot == "true" then true elif $nonroot == "false" then false else $nonroot end)
    }' 2>/dev/null
}

evidence() {
  show_pair json identity.json
  show_why "$1"
}

crit 1 "runs as uid 10001"          "runAsUser='$uid', want 10001"     -- [ "$uid" = "10001" ]
crit 1 "runs as gid 20001"          "runAsGroup='$gid', want 20001"    -- [ "$gid" = "20001" ]
crit 1 "refuses to start as root"   "runAsNonRoot='$nonroot', want true" -- [ "$nonroot" = "true" ]

crit_all_passed || evidence "The three fields are set independently and this check reads both the Pod securityContext, where a setting applies to every container, and the container's own, which wins where both are set — so a field reading back empty was set in neither place. runAsUser is the UID the process runs as, overriding whatever USER the image was built with. runAsGroup is the primary GID, which stays whatever the image declares — usually 0 — even after runAsUser is changed. runAsNonRoot is the enforcement half: runAsUser TELLS the kubelet which UID to use, runAsNonRoot makes it REFUSE to start a container that would end up as UID 0 anyway."
report "identity ok"
