#!/usr/bin/env bash
# points: 2
# desc: Pod archiver mounts the claim at /var/archive and an emptyDir at /var/scratch
# expected: pod-volumes.json json
set -uo pipefail
. /banks/_lib/checks.sh

# The mount comparison at the end addresses the container by the name the
# question gave it, so a Pod built with a differently named container would
# report its mounts as empty rather than as unreachable.
names=$(kubectl -n orion get pod archiver -o jsonpath='{.spec.containers[*].name}' 2>/dev/null)
[ -z "$names" ] || has_name "$names" web || {
  echo "pod archiver has no container named 'web' (found: $(name_list "$names"))"
  show_actual text "containers that exist: $(name_list "$names")"
  show_why "The question names the container 'web'. Mounts are per container and are read off that name, so under another one the volumes below are mounted in a container this check cannot see."
  exit 1
}

claim=$(kubectl -n orion get pod archiver -o json 2>/dev/null \
  | jq -r '[.spec.volumes[] | select(.persistentVolumeClaim.claimName == "archive-pvc") | .name] | first // ""')
scratch=$(kubectl -n orion get pod archiver \
  -o jsonpath='{.spec.volumes[?(@.name=="scratch")].emptyDir}' 2>/dev/null)
mounts=$(kubectl -n orion get pod archiver -o json 2>/dev/null \
  | jq -r --arg claim "$claim" '
      .spec.containers[] | select(.name == "web") | .volumeMounts
      | map(select(.name == $claim or .name == "scratch") | "\(.name)@\(.mountPath)")
      | sort | join(" ")')
expect=$(printf '%s@/var/archive scratch@/var/scratch' "$claim" | tr ' ' '\n' | sort | tr '\n' ' ')
expect=${expect% }

snapshot() {
  jq -n -S \
    --arg claim "${claim:-}" --arg scratch "${scratch:-}" --arg mounts "${mounts:-}" \
    '{
      claimVolume: (if $claim == "" then null else {name: $claim, persistentVolumeClaim: {claimName: "archive-pvc"}} end),
      scratchVolume: (if $scratch == "" then null else {name: "scratch", emptyDir: {}} end),
      mounts: ($mounts | if . == "" then [] else split(" ") end)
    }' 2>/dev/null
}

evidence() {
  show_pair json pod-volumes.json
  show_why "$1"
}

crit 1 "a volume backed by claim archive-pvc" \
  "no volume backed by claim archive-pvc" \
  "A Pod never references a PersistentVolume directly — it references a CLAIM, and the claim is what is bound to the volume. That indirection is the whole point: the Pod asks for storage of a certain shape and does not have to know which volume satisfied it. The volume entry needs persistentVolumeClaim.claimName." \
  -- [ -n "$claim" ]

crit 1 "an emptyDir named scratch" \
  "no emptyDir volume named scratch" \
  "emptyDir shares the POD's lifetime: created empty when it is scheduled, gone when it is deleted. Having both volumes here is the contrast the question is built on — one that outlives the Pod and one that does not." \
  -- [ -n "$scratch" ]

crit 2 "both mounted at the paths asked for" \
  "mounts are '$mounts', want '$expect'" \
  "Declaring a volume on the Pod and mounting it in a container are two separate steps, and a volume declared but never mounted appears nowhere inside the container. Each mount pairs a volume's name with the path it should appear at." \
  -- [ "$mounts" = "$expect" ]

crit_all_passed || evidence "$(crit_why)"
report "pod volumes ok"
