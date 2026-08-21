#!/usr/bin/env bash
# points: 2
# desc: egress allows only port 53 (UDP and TCP)
# expected: networkpolicy.json json
set -uo pipefail
. /banks/_lib/checks.sh

snapshot() {
  kubectl -n orbit get netpol api-guard -o json 2>/dev/null \
    | jq -S '.spec
      | .policyTypes |= sort
      | .ingress[]?.from |= sort
      | .ingress[]?.ports |= sort_by(.port, (.protocol // "TCP"))
      | .egress[]?.ports |= sort_by(.port, (.protocol // "TCP"))'
}

evidence() {
  show_pair json networkpolicy.json
  show_why "$1"
}

exists=$(kubectl -n orbit get netpol api-guard -o jsonpath='{.metadata.name}' 2>/dev/null)
[ -n "$exists" ] || {
  echo "NetworkPolicy api-guard not found in Namespace orbit"
  show_actual text "$(kubectl -n orbit get netpol 2>/dev/null)"
  show_why "Every part of this question is graded on a NetworkPolicy named api-guard in Namespace orbit, and the pane above lists what that Namespace actually holds. A policy created under another name, or in another Namespace, is invisible to every check here."
  exit 1
}

eg=$(kubectl -n orbit get netpol api-guard -o jsonpath='{.spec.egress}' 2>/dev/null)
protos=$(echo "$eg" | jq -r '[.[].ports[] | "\(.port)/\(.protocol)"] | sort | join(",")')
[ "$protos" = "53/TCP,53/UDP" ] && echo "egress ok" || {
  echo "egress ports: '$protos'"
  evidence "Once Egress is listed in policyTypes, everything outbound is denied except what an egress rule allows — including DNS, which is why a policy that forgets it leaves the Pods unable to resolve any name at all. DNS needs both protocols on port 53: UDP for ordinary queries and TCP for answers too large for one datagram, so both have to be written out."
  exit 1
}
