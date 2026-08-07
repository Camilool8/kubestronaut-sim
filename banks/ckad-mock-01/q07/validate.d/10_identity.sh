#!/usr/bin/env bash
# points: 2
# desc: runs as uid 10001 / gid 20001 and is refused if the image would run as root
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual json "$(kubectl -n cygnus get pod vault-agent -o json 2>/dev/null | jq --arg c agent '
    if any(.spec.containers[]; .name == $c)
    then {pod: .spec.securityContext, container: (first(.spec.containers[] | select(.name == $c)) | .securityContext)}
    else {"no such container": $c, "containers that exist": [.spec.containers[].name]}
    end')"
  show_why "$1"
}

# The fields below are read out of the container the question names. Nothing
# matching that name reads exactly like nothing being set, so say which it is
# before reporting a field as empty.
names=$(kubectl -n cygnus get pod vault-agent -o jsonpath='{.spec.containers[*].name}' 2>/dev/null)
has_name "$names" agent || {
  echo "pod vault-agent has no container named 'agent' (found: $(name_list "$names"))"
  evidence "Every securityContext field below is read off the container the question names. A container under a different name is a different container to the API, so the settings you put on it are not consulted and each field reads back empty — which is what the rest of this check would otherwise report."
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
[ "$uid" = "10001" ] || {
  echo "runAsUser='$uid', want 10001"
  evidence "runAsUser is the UID the container's process runs as, overriding whatever USER the image was built with. It is accepted on the Pod securityContext, where it applies to every container, and on the container's own, which wins where both are set — this check reads both panes, so an empty one means it was set in neither place."
  exit 1
}
[ "$gid" = "20001" ] || {
  echo "runAsGroup='$gid', want 20001"
  evidence "runAsGroup is the primary GID, the other half of the identity. Left unset it stays whatever the image declares — usually 0 — even when runAsUser has been changed, so the two are set independently."
  exit 1
}
[ "$nonroot" = "true" ] || {
  echo "runAsNonRoot='$nonroot', want true"
  evidence "runAsUser TELLS the kubelet which UID to use; runAsNonRoot: true makes it REFUSE to start the container if it would end up as UID 0 anyway — an image with USER root and no override never runs. Intent and enforcement, which is why the question asks for both rather than treating them as the same setting."
  exit 1
}
echo "identity ok"
