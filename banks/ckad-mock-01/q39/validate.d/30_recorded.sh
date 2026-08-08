#!/usr/bin/env bash
# points: 2
# desc: the recorded file holds the three Pod addresses the headless name resolves to
set -uo pipefail
. /banks/_lib/checks.sh

want=$(kubectl -n telescopium get endpointslice -l kubernetes.io/service-name=shard -o json 2>/dev/null \
  | jq -r '[.items[].endpoints[]? | select(.conditions.ready == true) | .addresses[]?] | unique | .[]')
got=$(file_lines_sorted /opt/course/39/shard-addresses | sort -u)
n=$(printf '%s\n' "$got" | grep -c '[0-9]')

evidence() {
  show_actual text "$(cat /opt/course/39/shard-addresses 2>/dev/null)"
  show_why "$1"
}

# Two empty sets are equal, and that must not read as a match: with no Service
# there is nothing to have recorded and nothing to compare it against.
addresses_match() { [ -n "$want" ] && [ -n "$got" ] && same_set "$got" "$want"; }

crit 1 "three distinct addresses recorded" \
  "/opt/course/39/shard-addresses holds $n address line(s), want 3" \
  "A headless name answers with one A record per ready endpoint, so this file should hold three addresses, one to a line and nothing else. Raw nslookup output does not qualify: it also carries the resolver's own address, which was never one of the answers." \
  -- [ "$n" = "3" ]

crit 1 "they are the Pods behind the headless Service" \
  "the addresses recorded are not the ones the Service publishes" \
  "The EndpointSlice the Service owns is where the DNS answer is generated from, so the two always agree and either is a fair way to read the addresses. Addresses that do not match are usually a different Service's, or the Pod names rather than their addresses." \
  -- addresses_match

crit_all_passed || evidence "$(crit_why)"
report "addresses recorded"
