#!/usr/bin/env bash
# points: 4
# desc: LimitRange container-defaults sets default requests and limits for containers
# expected: limitrange.json json
set -uo pipefail
. /banks/_lib/checks.sh

lr=$(kubectl -n fornax get limitrange container-defaults -o json 2>/dev/null)

# Only the Container-typed entry's default/defaultRequest maps are graded —
# not max/min (a different pair of fields, rejecting rather than filling in)
# and not a Pod-typed entry the question never asked for. A pane wider than
# that would mark an extra, ungraded entry as an error of its own.
snapshot() {
  printf '%s' "${lr:-null}" \
    | jq -S '(first(.spec.limits[]? | select(.type == "Container")) // {})
        | {default: {cpu: (.default.cpu // null), memory: (.default.memory // null)},
           defaultRequest: {cpu: (.defaultRequest.cpu // null), memory: (.defaultRequest.memory // null)}}' \
      2>/dev/null
}

evidence() {
  show_pair json limitrange.json
  show_why "$1"
}

[ -n "$lr" ] || {
  echo "LimitRange container-defaults not found in fornax"
  show_actual text "$(kubectl -n fornax get limitrange 2>/dev/null)"
  show_why "A LimitRange is a namespaced object and it only reaches the Namespace it was created in, so one made elsewhere defaults nothing here. Nothing of that name exists in fornax at all."
  exit 1
}

entry=$(printf '%s' "$lr" | jq -c '[.spec.limits[]? | select(.type == "Container")] | first // {}' 2>/dev/null)
dreq_cpu=$(printf '%s' "$entry" | jq -r '.defaultRequest.cpu // ""' 2>/dev/null)
dreq_mem=$(printf '%s' "$entry" | jq -r '.defaultRequest.memory // ""' 2>/dev/null)
dlim_cpu=$(printf '%s' "$entry" | jq -r '.default.cpu // ""' 2>/dev/null)
dlim_mem=$(printf '%s' "$entry" | jq -r '.default.memory // ""' 2>/dev/null)

crit 1 "defaults the CPU request to 100m" \
  "defaultRequest.cpu is '$dreq_cpu', want 100m" \
  "defaultRequest holds the values an admitted container is given when it REQUESTS none, and the entry carrying them has to be typed Container — a Pod-typed entry describes the sum across the Pod and defaults nothing. A quantity written 100m, 0.1 or 0.100 is the same amount, so what is here is a different figure or a different key." \
  -- [ "$(milli "$dreq_cpu")" = "100" ]

crit 1 "defaults the memory request to 128Mi" \
  "defaultRequest.memory is '$dreq_mem', want 128Mi" \
  "The request is what the scheduler reserves on a node, which is why filling it in is the half that stops these Pods being best-effort. Memory is compared by value here, so 128Mi and 131072Ki both count." \
  -- [ "$(mib "$dreq_mem")" = "128" ]

crit 1 "defaults the CPU limit to 500m" \
  "default.cpu is '$dlim_cpu', want 500m" \
  "The map called 'default' holds LIMITS, not requests — that naming is the trap in this object. Set only default and the request silently becomes equal to the limit, so a container that asked for nothing reserves the whole ceiling." \
  -- [ "$(milli "$dlim_cpu")" = "500" ]

crit 1 "defaults the memory limit to 256Mi" \
  "default.memory is '$dlim_mem', want 256Mi" \
  "The limit is the ceiling the kernel enforces; exceeding it gets a container killed for memory and throttled for CPU. max and min on the same entry are different fields again — they reject an object outright instead of filling anything in." \
  -- [ "$(mib "$dlim_mem")" = "256" ]

crit_all_passed || evidence "$(crit_why)"
report "limitrange ok"
