#!/usr/bin/env bash
# points: 2
# desc: the Pod that cannot be scheduled was identified by name
# expected: pod-name.txt text
set -uo pipefail
. /banks/_lib/checks.sh

got=$(file_text /opt/course/41/pod-name)

snapshot() {
  printf '%s' "${got:-}"
}

[ "$got" = "archive-indexer" ] && { echo "identified"; exit 0; }

echo "/opt/course/41/pod-name contains '$got', want archive-indexer"
show_pair text pod-name.txt
show_why "Pending means the scheduler has not placed the Pod on a node, so its READY column reads 0/1 and it has no node and no IP. The other two Pods here are Running and are not the subject. Only the Pod's own name belongs in the file — not the Namespace, not the status."
exit 1
