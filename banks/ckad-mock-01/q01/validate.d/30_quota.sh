#!/usr/bin/env bash
# points: 4
# desc: ResourceQuota staging-quota limits pods=5 and requests.cpu=1
set -uo pipefail
. /banks/_lib/checks.sh

evidence() {
  show_actual yaml "$(kubectl -n aurora-staging get quota staging-quota -o yaml 2>/dev/null | k8s_clean)"
  show_why "$1"
}

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

[ -n "${pods}${cpu}" ] || {
  echo "ResourceQuota staging-quota not found in aurora-staging"
  evidence "A ResourceQuota is a namespaced object, so it only limits the Namespace it was created in — one made in default caps nothing here. An empty pane means no object of that name exists in aurora-staging; a pane that shows one means it sets neither pods nor requests.cpu, and limits.cpu is a different key from requests.cpu."
  exit 1
}

# Both fields are Quantities, so both go through milli() and both targets
# are expressed in the same thousandths: 5 pods is 5000, 1 CPU is 1000.
[ "$(milli "$pods")" = "5000" ] || {
  echo "pods limit is '$pods', want 5"
  evidence "spec.hard.pods caps how many Pods may exist in the Namespace at once; once it is reached, creating another is rejected outright rather than left Pending. The question asks for 5 and the quota holds a different number."
  exit 1
}
[ "$(milli "$cpu")" = "1000" ] || {
  echo "requests.cpu limit is '$cpu', want 1"
  evidence "requests.cpu caps the sum of the CPU every Pod in the Namespace RESERVES, which is what the scheduler works from — limits.cpu, the ceiling the kernel enforces, is a separate key and capping it is a different guarantee. One CPU written 1, 1000m or 1.0 is the same quantity, so what is here is a different amount or a different key."
  exit 1
}
echo "quota ok"
