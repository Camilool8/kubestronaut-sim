#!/usr/bin/env bash
# points: 1
# desc: both StatefulSet replicas are Ready
# expected: none — the check grades whether the StatefulSet reached its
#           replica count, which is a reading taken at a moment rather than a
#           document the candidate authored. The message already names the
#           count.
set -uo pipefail
. /banks/_lib/checks.sh
ready=$(kubectl -n cepheus get statefulset ledger -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "$ready" = "2" ] && echo "2 ready replicas" || {
  echo "readyReplicas is '$ready', want 2"
  show_actual text "$(kubectl -n cepheus get pod 2>&1; echo; kubectl -n cepheus get pvc 2>&1)"
  show_why "A StatefulSet starts its replicas in order and will not start ledger-1 until ledger-0 is Ready, so one Pod up and the other missing entirely is the normal shape of a stall rather than a second failure. A Pod stuck Pending is usually waiting on its claim: the default class provisions the volume only once the Pod has been scheduled, so a claim that never binds and a Pod that never schedules are the same problem seen from two sides."
  exit 1
}
