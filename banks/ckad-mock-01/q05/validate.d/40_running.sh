#!/usr/bin/env bash
# points: 2
# desc: Deployment is ready and the sidecar's output was saved to the instance
set -uo pipefail
. /banks/_lib/checks.sh
ready=$(kubectl -n lyra get deploy feed-writer -o jsonpath='{.status.readyReplicas}' 2>/dev/null)

crit 1 "the Deployment has 1 ready replica" \
  "readyReplicas='$ready', want 1" \
  "Init containers run to completion in order before any ordinary container starts, so a Pod showing Init:0/2 is still inside wait-for-source — which only exits once the feed-source Service actually answers. A sidecar whose command is wrong shows up instead as restarts climbing on a Pod that never becomes ready." \
  -- [ "$ready" = "1" ]

crit 1 "the sidecar's output was saved to the instance" \
  "/opt/course/5/shipper.log is missing or has no timestamped lines" \
  "kubectl logs reads one container, and with none named it takes the first ordinary one — here that is writer, which prints nothing at all because it redirects its output into the file. The sidecar is the container that tails that file to stdout, so the capture has to name it." \
  -- grep -qE '[0-9]{4}' /opt/course/5/shipper.log

crit_all_passed || {
  show_actual text "$(kubectl -n lyra get pod 2>/dev/null; echo; head -20 /opt/course/5/shipper.log 2>/dev/null)"
  show_why "$(crit_why)"
}
report "running, logs captured"
