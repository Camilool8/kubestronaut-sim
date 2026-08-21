#!/usr/bin/env bash
# points: 4
# desc: Pod puller presents registry-cred as an image pull secret and is Running
# expected: pod.json json
set -uo pipefail
. /banks/_lib/checks.sh

pod=$(kubectl -n equuleus get pod puller -o json 2>/dev/null)
[ -n "$pod" ] || {
  echo "Pod puller not found in equuleus"
  show_actual text "$(kubectl -n equuleus get pod 2>/dev/null)"
  show_why "No Pod of that name exists in equuleus. The Secret on its own grants nothing — a credential is only ever used because a Pod, or the ServiceAccount it runs as, points at it."
  exit 1
}

pull=$(printf '%s' "$pod" | jq -r '[.spec.imagePullSecrets[]?.name] | join(" ")' 2>/dev/null)
names=$(printf '%s' "$pod" | jq -r '[.spec.containers[].name] | join(" ")' 2>/dev/null)
img=$(printf '%s' "$pod" | jq -r '[.spec.containers[] | select(.name == "web") | .image] | first // ""' 2>/dev/null)
phase=$(printf '%s' "$pod" | jq -r '.status.phase // ""' 2>/dev/null)

# Only the two authored criteria go in the pane — imagePullSecrets and the
# container's name/image. Whether the Pod actually reached Running is a
# behavioural reading and rides on its own crit message below instead;
# pairing it too would collide with this pane in the UI, which shows one
# actual/expected pair per check. Neither list's order is graded (membership
# is checked by name), so both are sorted.
snapshot() {
  printf '%s' "${pod:-null}" \
    | jq -S '{
        imagePullSecrets: ([.spec.imagePullSecrets[]?.name] | sort),
        containers: ([.spec.containers[]? | {name, image}] | sort_by(.name))
      }' 2>/dev/null
}

evidence() {
  show_pair json pod.json
  show_why "$1"
}

references_secret() { has_name "$pull" "registry-cred"; }

crit 2 "presents registry-cred when pulling" \
  "spec.imagePullSecrets holds $(name_list "$pull"), want registry-cred" \
  "imagePullSecrets is a Pod-level list, a sibling of containers rather than a field inside one: the credential is needed before any container exists, so it cannot belong to one. Its entries are objects with a single name key, and the Secret must live in the same Namespace as the Pod." \
  -- references_secret

crit 1 "one container named web on nginx:1.29-alpine" \
  "container 'web' (found: $(name_list "$names")) has image '$img', want nginx:1.29-alpine" \
  "The container name and image are pinned by the question. This image is one every node already holds, which is what lets the Pod start without the credential ever being exercised." \
  -- [ "$img" = "nginx:1.29-alpine" ]

crit 1 "the Pod is Running" \
  "pod phase is '$phase', want Running" \
  "A Pod naming a pull secret that does not exist still starts when its image is already on the node, because with a tag other than latest the policy defaults to IfNotPresent and no pull is attempted. A Pod that is not Running here is being held back by something else — describe names it." \
  -- [ "$phase" = "Running" ]

crit_all_passed || evidence "$(crit_why)"
report "pod wired to the credential"
