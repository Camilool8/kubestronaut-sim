#!/usr/bin/env bash
# points: 2
# desc: checkout-api rolls out with maxSurge 2 and maxUnavailable 0, written as absolute Pod counts
# expected: strategy.json json
set -uo pipefail
. /banks/_lib/checks.sh

NS=reticulum
DEP=checkout-api

dep=$(kubectl -n "$NS" get deploy "$DEP" -o json 2>/dev/null)

[ -n "$dep" ] || {
  echo "Deployment $DEP not found in Namespace $NS"
  show_actual text "$(kubectl -n "$NS" get deploy 2>/dev/null)"
  show_why "The rolling update strategy graded here belongs to the Deployment $DEP in Namespace $NS, and the pane above lists what that Namespace actually holds. A ReplicaSet has no strategy of its own to carry these fields — they live on the Deployment, which is the controller that decides how one ReplicaSet is replaced by the next."
  exit 1
}

# The whole strategy block, shown as the API stores it. It is worth seeing
# whole: both fields are IntOrString, so 2 and "2" and "50%" are three different
# values in the same slot, and a pane that printed only the numbers would hide
# which of them is there.
strategy=$(printf '%s' "$dep" | jq '.spec.strategy' 2>/dev/null)

kind=$(printf '%s' "$dep" | jq -r '.spec.strategy.type // "<none>"' 2>/dev/null)
surge=$(printf '%s' "$dep" \
  | jq -r '.spec.strategy.rollingUpdate.maxSurge | if . == null then "<none>" else tojson end' 2>/dev/null)
unavail=$(printf '%s' "$dep" \
  | jq -r '.spec.strategy.rollingUpdate.maxUnavailable | if . == null then "<none>" else tojson end' 2>/dev/null)

snapshot() {
  printf '%s' "${strategy:-null}" | jq -S '.' 2>/dev/null
}

evidence() {
  show_pair json strategy.json
  show_why "$1"
}

# The count is what is graded, not its serialisation. The string arm should be
# unreachable — Deployment validation requires a STRING in this field to be a
# percentage, so "2" is refused at write time and only the integer 2 can be in
# there — and accepting it anyway costs nothing and keeps this criterion about
# the value rather than about how it was typed. A percentage is a different
# value and is not accepted: the question asks for counts because a percentage
# is resolved against the replica count and re-resolves when the Deployment is
# resized.
surge_ok() {
  printf '%s' "$dep" | jq -e '
    (.spec.strategy.type == "RollingUpdate")
    and (.spec.strategy.rollingUpdate.maxSurge as $v
         | $v == 2 or $v == "2")' >/dev/null 2>&1
}

unavail_ok() {
  printf '%s' "$dep" | jq -e '
    (.spec.strategy.type == "RollingUpdate")
    and (.spec.strategy.rollingUpdate.maxUnavailable as $v
         | $v == 0 or $v == "0")' >/dev/null 2>&1
}

crit 1 "maxSurge is 2" \
  "strategy.type is $kind and maxSurge is $surge, want RollingUpdate with 2" \
  "maxSurge is how many Pods the Deployment may run ABOVE its replica count while a rollout is in flight — the headroom the new ReplicaSet is created into. It is one of two fields that only exist under type: RollingUpdate; type: Recreate has no rollingUpdate block at all, and setting the type to Recreate deletes the block along with anything written in it. Read the pane before assuming a field is simply missing: both fields default to 25% when nothing is written, so a Deployment nobody has touched still shows a complete strategy, and this one was seeded with a strategy of its own. The field is IntOrString: an unquoted integer is an absolute Pod count, and a quoted value has to be a percentage — validation rejects a string here that does not end in %, so 2 is the way to write two Pods and \"2\" is not a spelling of it. A percentage is a different value in the same slot: it is resolved against the replica count and re-resolves whenever the Deployment is resized, which is why the question asked for counts." \
  -- surge_ok

crit 1 "maxUnavailable is 0" \
  "strategy.type is $kind and maxUnavailable is $unavail, want RollingUpdate with 0" \
  "maxUnavailable is the other half, and 0 is the setting that makes a rollout cost no serving capacity: no old Pod is removed until a new one is Ready to replace it, which is only possible because maxSurge left room to create that new one first. The two may not both be zero — the API rejects that, since nothing could ever move — and note the asymmetry in their defaults' rounding: 25% of 2 replicas rounds DOWN to 0 for maxUnavailable and UP to 1 for maxSurge, so Kubernetes always leaves a rollout at least one Pod of room to make progress." \
  -- unavail_ok

crit_all_passed || evidence "$(crit_why)"
report "rollout strategy set to surge 2, unavailable 0"
