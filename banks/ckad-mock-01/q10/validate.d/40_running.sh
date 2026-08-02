#!/usr/bin/env bash
# points: 1
# desc: the archiver Pod is running with its volumes attached
set -uo pipefail
. /banks/_lib/checks.sh
# A Pod referencing an unbindable claim sits in Pending indefinitely, so
# Running is what proves the storage actually attached.
phase=$(kubectl -n orion get pod archiver -o jsonpath='{.status.phase}' 2>/dev/null)
[ "$phase" = "Running" ] && echo "running" || {
  echo "phase is '$phase', want Running"
  show_actual text "$(kubectl -n orion get pod 2>/dev/null; echo; kubectl -n orion get pvc 2>/dev/null)"
  show_why "A Pod whose claim is not Bound never schedules — it waits in Pending, because the kubelet cannot mount storage that does not exist yet. Running is therefore the only thing that proves the claim really attached rather than merely being referenced."
  exit 1
}
