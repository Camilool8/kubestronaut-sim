#!/usr/bin/env bash
# points: 1
# desc: the archiver Pod is running with its volumes attached
# expected: none — the check grades the Pod's status.phase, a live reading
#           taken at a moment rather than a document the candidate authored.
#           The Pod/PVC table already names what is actually there.
set -uo pipefail
. /banks/_lib/checks.sh
phase=$(kubectl -n orion get pod archiver -o jsonpath='{.status.phase}' 2>/dev/null)
[ "$phase" = "Running" ] && echo "running" || {
  echo "phase is '$phase', want Running"
  show_actual text "$(kubectl -n orion get pod 2>/dev/null; echo; kubectl -n orion get pvc 2>/dev/null)"
  show_why "A Pod whose claim is not Bound never schedules — it waits in Pending, because the kubelet cannot mount storage that does not exist yet. Running is therefore the only thing that proves the claim really attached rather than merely being referenced."
  exit 1
}
