#!/usr/bin/env bash
# points: 4
# desc: ResourceQuota staging-quota limits pods=5 and requests.cpu=1
set -uo pipefail
. /banks/_lib/checks.sh

# Fetched as two values rather than one space-joined string, because each
# has to be normalised before it is compared. resource.Quantity keeps the
# spelling it was parsed from, so a quota of one CPU comes back as `1`,
# `1000m` or `1.0` depending on what the candidate typed — all three are
# the same quota, and the string match this replaced scored two of them
# wrong. Same standard as q07/validate.d/30_resources.sh.
pods=$(kubectl -n aurora-staging get quota staging-quota \
  -o jsonpath='{.spec.hard.pods}' 2>/dev/null)
cpu=$(kubectl -n aurora-staging get quota staging-quota \
  -o jsonpath='{.spec.hard.requests\.cpu}' 2>/dev/null)

[ -n "${pods}${cpu}" ] || { echo "ResourceQuota staging-quota not found in aurora-staging"; exit 1; }

# Both fields are Quantities, so both go through milli() and both targets
# are expressed in the same thousandths: 5 pods is 5000, 1 CPU is 1000.
[ "$(milli "$pods")" = "5000" ] || { echo "pods limit is '$pods', want 5"; exit 1; }
[ "$(milli "$cpu")" = "1000" ] || { echo "requests.cpu limit is '$cpu', want 1"; exit 1; }
echo "quota ok"
