#!/usr/bin/env bash
# points: 2
# desc: Deployment is ready and the sidecar's output was saved to the instance
set -uo pipefail
ready=$(kubectl -n lyra get deploy feed-writer -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "$ready" = "1" ] || { echo "readyReplicas='$ready', want 1"; exit 1; }

# The sidecar tails a file the main container writes with `date`, so any
# real capture contains a year. An empty file, or `kubectl logs` output
# from the wrong container, does not.
grep -qE '[0-9]{4}' /opt/course/5/shipper.log 2>/dev/null \
  && echo "running, logs captured" \
  || { echo "/opt/course/5/shipper.log is missing or has no timestamped lines"; exit 1; }
