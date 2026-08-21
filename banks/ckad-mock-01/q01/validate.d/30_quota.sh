#!/usr/bin/env bash
# points: 4
# desc: ResourceQuota staging-quota limits pods=5 and requests.cpu=1
# expected: quota.json json
set -uo pipefail
. /banks/_lib/checks.sh

snapshot() {
  kubectl -n aurora-staging get quota staging-quota -o json 2>/dev/null \
    | jq -S '.spec.hard // {} | {pods: (.pods // null), "requests.cpu": (."requests.cpu" // null)}'
}

evidence() {
  show_pair json quota.json
  show_why "$1"
}

pods=$(kubectl -n aurora-staging get quota staging-quota \
  -o jsonpath='{.spec.hard.pods}' 2>/dev/null)
cpu=$(kubectl -n aurora-staging get quota staging-quota \
  -o jsonpath='{.spec.hard.requests\.cpu}' 2>/dev/null)

[ -n "${pods}${cpu}" ] || {
  echo "ResourceQuota staging-quota not found in aurora-staging"
  show_actual text "$(kubectl -n aurora-staging get quota 2>/dev/null)"
  show_why "A ResourceQuota is a namespaced object, so it only limits the Namespace it was created in — one made in default caps nothing here. The pane above lists what aurora-staging actually holds; an empty one means no object of that name exists there at all."
  exit 1
}

crit 1 "caps the Namespace at 5 Pods" \
  "pods limit is '$pods', want 5" \
  "spec.hard.pods caps how many Pods may exist in the Namespace at once; once it is reached, creating another is rejected outright rather than left Pending." \
  -- [ "$(milli "$pods")" = "5000" ]

crit 1 "caps requested CPU at 1" \
  "requests.cpu limit is '$cpu', want 1" \
  "requests.cpu caps the sum of the CPU every Pod in the Namespace RESERVES, which is what the scheduler works from — limits.cpu, the ceiling the kernel enforces, is a separate key and capping it is a different guarantee. One CPU written 1, 1000m or 1.0 is the same quantity, so what is here is a different amount or a different key." \
  -- [ "$(milli "$cpu")" = "1000" ]

crit_all_passed || evidence "$(crit_why)"
report "quota ok"
