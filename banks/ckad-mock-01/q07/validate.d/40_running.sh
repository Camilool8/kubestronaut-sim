#!/usr/bin/env bash
# points: 1
# desc: the hardened Pod actually runs
# expected: none — the check grades the Pod's status.phase, a live reading taken
#           at a moment rather than a document the candidate authored. The
#           message and container-state pane already name what is happening.
set -uo pipefail
. /banks/_lib/checks.sh
phase=$(kubectl -n cygnus get pod vault-agent -o jsonpath='{.status.phase}' 2>/dev/null)
[ "$phase" = "Running" ] && echo "running" || {
  echo "phase is '$phase', want Running"
  show_actual json "$(kubectl -n cygnus get pod vault-agent -o json 2>/dev/null | jq '{phase: .status.phase, containers: [.status.containerStatuses[]? | {name, ready, restartCount, state}]}')"
  show_why "Every setting the checks above look for can be present in a Pod that never runs, which is why this is graded separately. A read-only root filesystem is the usual cause: an image that writes to a temporary directory at startup cannot, and crashes. runAsNonRoot is the other — it refuses outright to start an image whose configured user is root. The container's state above names which of the two happened."
  exit 1
}
