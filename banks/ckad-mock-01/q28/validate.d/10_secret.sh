#!/usr/bin/env bash
# points: 5
# desc: Secret registry-cred is a dockerconfigjson credential for registry:5000
# expected: secret.json json
set -uo pipefail
. /banks/_lib/checks.sh

sec=$(kubectl -n equuleus get secret registry-cred -o json 2>/dev/null)
[ -n "$sec" ] || {
  echo "Secret registry-cred not found in equuleus"
  show_actual text "$(kubectl -n equuleus get secret 2>/dev/null)"
  show_why "A Secret is namespaced, so one of this name elsewhere is a different object and the kubelet in equuleus will never see it. Nothing of that name exists here."
  exit 1
}

type=$(printf '%s' "$sec" | jq -r '.type // ""' 2>/dev/null)
cfg=$(printf '%s' "$sec" | jq -r '.data[".dockerconfigjson"] // ""' 2>/dev/null | base64 -d 2>/dev/null)

# The kubelet matches a registry host with or without a scheme, so grade the
# same way rather than on how the server happened to be spelled.
servers=$(printf '%s' "$cfg" | jq -r '(.auths // {}) | keys | .[]' 2>/dev/null \
  | sed -e 's#^https\{0,1\}://##' -e 's#/*$##' | tr '\n' ' ')
entry=$(printf '%s' "$cfg" | jq -c '[(.auths // {}) | to_entries[]
        | select((.key | sub("^https?://"; "") | sub("/+$"; "")) == "registry:5000")
        | .value] | first // {}' 2>/dev/null)
user=$(printf '%s' "$entry" | jq -r '.username // ""' 2>/dev/null)
pass=$(printf '%s' "$entry" | jq -r '.password // ""' 2>/dev/null)
if [ -z "$user" ] || [ -z "$pass" ]; then
  blob=$(printf '%s' "$entry" | jq -r '.auth // ""' 2>/dev/null | base64 -d 2>/dev/null)
  case $blob in
    *:*) user=${blob%%:*}; pass=${blob#*:} ;;
  esac
fi

# The kubelet reads the same host with or without a scheme, and the check
# below matches that way — $servers is already stripped of scheme and
# trailing slash — so the snapshot documents the canonical host rather than
# however it happens to be spelled in .auths. Likewise the username/password
# shown here are the check's own derivation, which falls back to decoding
# the 'auth' blob when there is no separate username/password: a candidate
# who wrote the credential either way sees the same pane.
snapshot() {
  jq -n -S \
    --arg type "${type:-}" \
    --arg user "${user:-}" \
    --arg pass "${pass:-}" \
    --arg servers "${servers:-}" \
    '{
      type: (if $type == "" then null else $type end),
      servers: ($servers | split(" ") | map(select(length > 0)) | sort),
      auth: {
        username: (if $user == "" then null else $user end),
        password: (if $pass == "" then null else $pass end)
      }
    }' 2>/dev/null
}

evidence() {
  show_pair json secret.json
  show_why "$1"
}

names_registry() { has_name "$servers" "registry:5000"; }
creds_ok() { [ "$user" = "pipeline" ] && [ "$pass" = "s3cr3t-pull" ]; }

crit 2 "the type is kubernetes.io/dockerconfigjson" \
  "type is '$type', want kubernetes.io/dockerconfigjson" \
  "A Secret's type is functional, not decorative: the kubelet looks for this one specifically when it assembles pull credentials, and a generic Secret holding exactly the same bytes is typed Opaque and ignored. kubectl create secret docker-registry is the subcommand that sets it." \
  -- [ "$type" = "kubernetes.io/dockerconfigjson" ]

crit 2 "the credential names registry:5000" \
  "the credential covers $(name_list "$servers"), want registry:5000" \
  "The body under the .dockerconfigjson key is a docker config document, and the keys of its auths map are the registry hosts the credential applies to. The kubelet matches the host of the image being pulled against those keys, so a credential filed under any other host is never offered for an image from registry:5000." \
  -- names_registry

crit 1 "carries the username and password" \
  "the entry for registry:5000 holds username='$user', want pipeline with the given password" \
  "The entry stores the username and password, and kubectl also derives the base64 'auth' blob that actually travels in the Authorization header. One of the two values here is wrong or absent." \
  -- creds_ok

crit_all_passed || evidence "$(crit_why)"
report "registry credential ok"
