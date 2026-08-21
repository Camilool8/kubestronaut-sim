#!/usr/bin/env bash
# points: 1
# desc: the archive Deployment mounts the archive-data claim at /data in its web container
# expected: mount.json json
set -uo pipefail
. /banks/_lib/checks.sh

NS=crater
DEP=archive
PVC=archive-data
CTR=web
MOUNT=/data

dep=$(kubectl -n "$NS" get deploy "$DEP" -o json 2>/dev/null)

[ -n "$dep" ] || {
  echo "Deployment $DEP not found in Namespace $NS"
  show_actual text "$(kubectl -n "$NS" get deploy 2>/dev/null)"
  show_why "This question mounts the claim into the Deployment that was already in crater, under its own name. The pane above lists what the Namespace holds. A Pod created alongside it with the volume attached is not the same answer: nothing recreates that Pod, so the storage is gone with it."
  exit 1
}

names=$(kubectl -n "$NS" get deploy "$DEP" \
  -o jsonpath='{.spec.template.spec.containers[*].name}' 2>/dev/null)

has_name "$names" "$CTR" || {
  echo "no container named '$CTR' in deploy/$DEP (found: $(name_list "$names"))"
  show_actual json "$(printf '%s' "$dep" | jq '[.spec.template.spec.containers[]? | {name, image}]' 2>/dev/null)"
  show_why "The question names the container the volume belongs in, and this check reads that one. A pane showing another name means the container was renamed, which was never asked for; an empty pane means the Pod template has no containers at all."
  exit 1
}

# Graded on the Pod TEMPLATE rather than on a running Pod, deliberately. This
# class provisions where the first consumer was scheduled and pins the volume
# to that node, so a Pod can be perfectly correct and still be unable to run —
# if it landed on a node another question later drains or leaves NotReady, it
# has nowhere to go, and that is not this candidate's mistake. The template is
# what was actually written here; the claim's own Bound state is graded next
# door, and it survives all of that because binding is permanent.
mount=$(printf '%s' "$dep" | jq -r --arg c "$CTR" --arg p "$PVC" --arg m "$MOUNT" '
  .spec.template.spec as $pod
  | [ $pod.volumes[]? | select(.persistentVolumeClaim.claimName == $p) | .name ] as $claimed
  | [ $pod.containers[]?
      | select(.name == $c)
      | .volumeMounts[]?
      | select(.mountPath == $m)
      | .name as $n
      | select($claimed | index($n) != null) ]
  | length' 2>/dev/null)
case ${mount:-} in ''|*[!0-9]*) mount=0 ;; esac

# What the template says instead, for the message: where the container mounts
# things, and what the Pod's volumes are made of.
where=$(printf '%s' "$dep" | jq -r --arg c "$CTR" '
  [ .spec.template.spec.containers[]? | select(.name == $c) | .volumeMounts[]?.mountPath ]
  | join(", ") | if . == "" then "nothing" else . end' 2>/dev/null)
sources=$(printf '%s' "$dep" | jq -r '
  [ .spec.template.spec.volumes[]?
    | .name + " -> " + (.persistentVolumeClaim.claimName // (keys_unsorted | map(select(. != "name")) | join(","))) ]
  | join("; ") | if . == "" then "no volumes" else . end' 2>/dev/null)

snapshot() {
  printf '%s' "$dep" | jq -S --arg c "$CTR" '{
      volumes: (.spec.template.spec.volumes // []),
      mounts: [ .spec.template.spec.containers[]? | select(.name == $c)
                | {container: .name, volumeMounts: (.volumeMounts // [])} ]}' 2>/dev/null
}

evidence() {
  show_pair json mount.json
  show_why "$1"
}

mounts_the_claim() { [ "$mount" -ge 1 ]; }

crit 1 "the web container mounts archive-data at /data" \
  "the $CTR container mounts $where, and the Pod's volumes are: $sources" \
  "A volume reaches a container in two halves and both have to be there. The Pod declares the volume — a name plus a persistentVolumeClaim naming archive-data — and the container declares a volumeMount that refers to that volume BY NAME and gives it a path. Only one of the two is an error the API will catch, and it is not the one people get wrong: a mount naming a volume that does not exist is rejected, while a volume nobody mounts is accepted in silence and does nothing. Both halves belong to the Deployment's Pod template, which is what every replacement Pod is built from — adding them to a running Pod is not possible, and would not survive the Pod either. And keep the claim name straight: the volume refers to the CLAIM, never to the PersistentVolume the claim was given." \
  -- mounts_the_claim

crit_all_passed || evidence "$(crit_why)"
report "claim mounted"
