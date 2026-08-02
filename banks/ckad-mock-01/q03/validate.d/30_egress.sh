#!/usr/bin/env bash
# points: 2
# desc: egress allows only port 53 (UDP and TCP)
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual yaml "$(kubectl -n orbit get netpol api-guard -o yaml 2>/dev/null | k8s_clean)"
  show_expected yaml "/banks/${BANK:-ckad-mock-01}/q03/expected/networkpolicy.yaml"
  show_why "$1"
}

eg=$(kubectl -n orbit get netpol api-guard -o jsonpath='{.spec.egress}' 2>/dev/null)
protos=$(echo "$eg" | jq -r '[.[].ports[] | "\(.port)/\(.protocol)"] | sort | join(",")')
[ "$protos" = "53/TCP,53/UDP" ] && echo "egress ok" || {
  echo "egress ports: '$protos'"
  evidence "Once Egress is listed in policyTypes, everything outbound is denied except what an egress rule allows — including DNS, which is why a policy that forgets it leaves the Pods unable to resolve any name at all. DNS needs both protocols on port 53: UDP for ordinary queries and TCP for answers too large for one datagram, so both have to be written out."
  exit 1
}
