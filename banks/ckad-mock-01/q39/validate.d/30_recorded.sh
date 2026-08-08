#!/usr/bin/env bash
# points: 2
# desc: the recorded file holds the per-Pod DNS name of each of the three Pods
set -uo pipefail
. /banks/_lib/checks.sh

FILE=/opt/course/39/shard-names
SUFFIX=.shard.telescopium.svc.cluster.local

# The Pods the Service publishes, named rather than addressed. targetRef is the
# Pod behind each endpoint, and <pod>.<service>.<namespace>.svc.cluster.local is
# the name the cluster's DNS answers for it while the Service is headless.
want=$(kubectl -n telescopium get endpointslice -l kubernetes.io/service-name=shard -o json 2>/dev/null \
  | jq -r --arg suffix "$SUFFIX" '[.items[].endpoints[]?
      | select(.conditions.ready == true)
      | .targetRef.name // empty
      | . + $suffix] | unique | .[]')

# A trailing dot is the DNS root, not a different name, so it is normalised away
# rather than scored.
got=$(file_lines_sorted "$FILE" | sed 's/\.$//' | sort -u)
lines=$(printf '%s\n' "$got" | grep -c '.')
named=$(printf '%s\n' "$got" | grep -c '^shard-[0-9][0-9]*\.shard\.telescopium\.svc\.cluster\.local$')

evidence() {
  show_actual text "$(cat "$FILE" 2>/dev/null)"
  show_why "$1"
}

three_names() { [ "$lines" = "3" ] && [ "$named" = "3" ]; }

# Two empty sets are equal, and that must not read as a match: with no Service
# there is nothing to have recorded and nothing to compare it against.
names_match() { [ -n "$want" ] && [ -n "$got" ] && same_set "$got" "$want"; }

crit 1 "three distinct per-Pod names recorded" \
  "$FILE holds $lines line(s), $named of them a per-Pod name of the form shard-N${SUFFIX}, want 3" \
  "A headless Service publishes a name for every Pod in the set — <pod>.<service>.<namespace>.svc.cluster.local — and this set runs three Pods, so the file should hold three of those names fully qualified, one to a line and nothing else. The Pod addresses are not the answer here: a rescheduled Pod comes back with the same name at a different address, which is the whole reason a StatefulSet is given a headless Service to be reached through." \
  -- three_names

crit 1 "they are the Pods behind the headless Service" \
  "the names recorded are not the ones the Service publishes" \
  "These names exist only for the Pods the Service actually selects, so they are read off it rather than written from memory: each endpoint on the EndpointSlice the Service owns carries a targetRef naming its Pod, and the per-Pod name is that Pod's name in front of the Service's own DNS name. A name for a Pod the Service does not publish resolves to nothing, and while the Service does not exist at all neither does any of them." \
  -- names_match

crit_all_passed || evidence "$(crit_why)"
report "names recorded"
