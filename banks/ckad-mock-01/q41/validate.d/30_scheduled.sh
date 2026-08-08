#!/usr/bin/env bash
# points: 3
# desc: archive-indexer was replaced with a request the cluster can satisfy and is Running
set -uo pipefail
. /banks/_lib/checks.sh

evidence() {
  show_actual json "$(kubectl -n columba get pod archive-indexer -o json 2>/dev/null \
    | jq '{phase: .status.phase, node: .spec.nodeName,
           containers: [.spec.containers[] | {name, image, requests: .resources.requests}]}')"
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

crit 1 "still the container and image it had" \
  "the indexer container runs '$img', want busybox:1.37" \
  "Replacing a Pod is not the same as writing a new one. The question fixes the name, the container name and the image so that only the request changes; an empty value here also means the container was renamed, since it is looked up by name." \
  -- [ "$img" = "busybox:1.37" ]

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
