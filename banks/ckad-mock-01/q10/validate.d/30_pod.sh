#!/usr/bin/env bash
# points: 1
# desc: Pod archiver mounts the claim at /var/archive and an emptyDir at /var/scratch
set -uo pipefail
claim=$(kubectl -n orion get pod archiver -o json 2>/dev/null \
  | jq -r '[.spec.volumes[] | select(.persistentVolumeClaim.claimName == "archive-pvc") | .name] | first // ""')
[ -n "$claim" ] || { echo "no volume backed by claim archive-pvc"; exit 1; }

scratch=$(kubectl -n orion get pod archiver \
  -o jsonpath='{.spec.volumes[?(@.name=="scratch")].emptyDir}' 2>/dev/null)
[ -n "$scratch" ] || { echo "no emptyDir volume named scratch"; exit 1; }

mounts=$(kubectl -n orion get pod archiver -o json 2>/dev/null \
  | jq -r --arg claim "$claim" '
      .spec.containers[] | select(.name == "web") | .volumeMounts
      | map(select(.name == $claim or .name == "scratch") | "\(.name)@\(.mountPath)")
      | sort | join(" ")')
expect=$(printf '%s@/var/archive scratch@/var/scratch' "$claim" | tr ' ' '\n' | sort | tr '\n' ' ')
expect=${expect% }
[ "$mounts" = "$expect" ] \
  && echo "pod volumes ok" \
  || { echo "mounts are '$mounts', want '$expect'"; exit 1; }
