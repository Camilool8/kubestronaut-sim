#!/usr/bin/env bash
# points: 3
# desc: archive-indexer was replaced with a request the cluster can satisfy and is Running
# expected: pod.json json
set -uo pipefail
. /banks/_lib/checks.sh

# Only the authored half — the indexer container's image and its memory
# request — gets a generated document. phase is a live scheduling reading
# graded by its own criterion below, and node is not graded at all; neither
# belongs beside a fixed reference (node assignment in particular is not
# something the candidate wrote).
snapshot() {
  kubectl -n columba get pod archive-indexer -o json 2>/dev/null \
    | jq -S '(first(.spec.containers[]? | select(.name=="indexer")) // {})
             | {image: (.image // null), requests: (.resources.requests // null)}'
}

evidence() {
  show_pair json pod.json
  show_why "$1"
}

# The other two Pods were the control: the Namespace's healthy workloads are
# not collateral, and clearing them out is not a step towards anything.
others=$(kubectl -n columba get pod -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)
for p in price-feed report-cache; do
  has_name "$others" "$p" || {
    echo "Pod ${p} is gone; the other two Pods were to be left alone (found: $(name_list "$others"))"
    show_actual text "$(kubectl -n columba get pod -o wide 2>/dev/null)"
    show_why "Two of the three Pods here were serving and one was not, and telling them apart before changing anything is most of the exercise. Replacing the Pending one does not require touching either of the others."
    exit 1
  }
done

phase=$(kubectl -n columba get pod archive-indexer -o jsonpath='{.status.phase}' 2>/dev/null)
[ -n "$phase" ] || {
  echo "there is no Pod archive-indexer in columba"
  show_actual text "$(kubectl -n columba get pod -o wide 2>/dev/null)"
  show_why "The Pod had to come back under the same name after being replaced. Deleting it is half of the fix — a bare Pod has no controller behind it, so nothing recreates it and nothing rolls it out again."
  exit 1
}

img=$(kubectl -n columba get pod archive-indexer \
  -o jsonpath='{.spec.containers[?(@.name=="indexer")].image}' 2>/dev/null)
mem=$(kubectl -n columba get pod archive-indexer \
  -o jsonpath='{.spec.containers[?(@.name=="indexer")].resources.requests.memory}' 2>/dev/null)

# The seeded Pod already runs that container on that image — the exercise
# changes nothing but the request — so "it still does" is true of a Namespace
# nobody has touched. What survived the replacement only counts once there has
# been a replacement, which is visible as the request that could not be
# scheduled being gone.
seeded_request=$(mib 900Gi)
survived_the_replacement() {
  [ "$img" = "busybox:1.37" ] && [ "$(mib "$mem")" != "$seeded_request" ]
}

crit 1 "replaced, and still the container and image it had" \
  "the indexer container runs '$img' asking for '$mem'; want busybox:1.37 on a Pod that no longer carries the 900Gi request it was created with" \
  "Replacing a Pod is not the same as writing a new one. The question fixes the name, the container name and the image so that only the request changes; an empty value here also means the container was renamed, since it is looked up by name. Keeping them is not work on its own — the Pod that is there already has them — so this counts once the original request has actually been replaced." \
  -- survived_the_replacement

crit 1 "asks for 64Mi of memory" \
  "the indexer container requests '$mem' of memory, want 64Mi" \
  "requests is the number the scheduler subtracts from a node's allocatable capacity, and the old value was larger than any node has. Any spelling of the same quantity is accepted — 64Mi and 65536Ki are the same amount of memory — but the amount itself is what the question pins." \
  -- [ "$(mib "$mem")" = "64" ]

crit 1 "is scheduled and running" \
  "archive-indexer is '$phase', want Running" \
  "Pending is the scheduler still looking; Running is it having found a node and the kubelet having started the container. If the phase is still Pending after the request came down, read the events again — the message names whichever predicate rejected the nodes this time." \
  -- [ "$phase" = "Running" ]

crit_all_passed || evidence "$(crit_why)"
report "archive-indexer scheduled"
