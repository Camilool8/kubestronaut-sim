#!/usr/bin/env bash
# points: 3
# desc: Pod unspecified is Running and carries the defaulted requests and limits
# expected: none — the manifest deliberately carries no resources block, so
#           the requests and limits read back here were written by the
#           LimitRanger admission plugin at creation time, not by the
#           candidate. This is a relationship between two live values (the
#           LimitRange's defaults and what admission actually stamped onto
#           the Pod) plus a phase reading, not a document to author.
set -uo pipefail
. /banks/_lib/checks.sh

pod=$(kubectl -n fornax get pod unspecified -o json 2>/dev/null)
[ -n "$pod" ] || {
  echo "Pod unspecified not found in fornax"
  show_actual text "$(kubectl -n fornax get pod 2>/dev/null)"
  show_why "No Pod of that name exists in fornax. This half of the question is what proves the LimitRange does anything: a defaulting rule with nothing admitted under it has never been exercised."
  exit 1
}

names=$(printf '%s' "$pod" | jq -r '[.spec.containers[].name] | join(" ")' 2>/dev/null)
c=$(printf '%s' "$pod" | jq -c '[.spec.containers[] | select(.name == "app")] | first // {}' 2>/dev/null)
req_cpu=$(printf '%s' "$c" | jq -r '.resources.requests.cpu // ""' 2>/dev/null)
req_mem=$(printf '%s' "$c" | jq -r '.resources.requests.memory // ""' 2>/dev/null)
lim_cpu=$(printf '%s' "$c" | jq -r '.resources.limits.cpu // ""' 2>/dev/null)
lim_mem=$(printf '%s' "$c" | jq -r '.resources.limits.memory // ""' 2>/dev/null)
phase=$(printf '%s' "$pod" | jq -r '.status.phase // ""' 2>/dev/null)

evidence() {
  show_actual json "$(printf '%s' "$pod" | jq '{phase: .status.phase, limitRanger: .metadata.annotations."kubernetes.io/limit-ranger", containers: [.spec.containers[] | {name, resources}]}' 2>/dev/null)"
  show_why "$1"
}

requests_ok() {
  [ "$(milli "$req_cpu")" = "100" ] && [ "$(mib "$req_mem")" = "128" ]
}
limits_ok() {
  [ "$(milli "$lim_cpu")" = "500" ] && [ "$(mib "$lim_mem")" = "256" ]
}

crit 1 "the Pod is Running" \
  "pod phase is '$phase', want Running" \
  "Defaulting happens whether or not the Pod ever starts, so a Pod that is stuck proves only that the API server accepted it. The question asks for a workload that actually came up carrying these values." \
  -- [ "$phase" = "Running" ]

crit 1 "container app carries the defaulted requests" \
  "container 'app' (found: $(name_list "$names")) has requests cpu='$req_cpu' memory='$req_mem', want 100m and 128Mi" \
  "These values are on the Pod even though no manifest named them: the LimitRanger admission plugin rewrote the object on its way in. Empty ones mean the Pod was admitted before the LimitRange existed — admission runs once, nothing reconciles afterwards, so the fix is to delete the Pod and create it again." \
  -- requests_ok

crit 1 "container app carries the defaulted limits" \
  "container 'app' has limits cpu='$lim_cpu' memory='$lim_mem', want 500m and 256Mi" \
  "The limits come from the 'default' map while the requests come from 'defaultRequest'. Limits present with requests equal to them is the signature of a LimitRange that set only one of the two: with no defaultRequest, the request is copied from the limit." \
  -- limits_ok

crit_all_passed || evidence "$(crit_why)"
report "pod carries the defaults"
