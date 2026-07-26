#!/usr/bin/env bash
# points: 1
# desc: the container's log output was saved to /opt/course/9/pulsar.log
set -uo pipefail
# The agent prints its channel on startup, so a real capture from the
# rebuilt image says "stable". A log saved before the Dockerfile edit
# says "beta", which is the mistake this catches.
log=$(cat /opt/course/9/pulsar.log 2>/dev/null)
[ -n "$log" ] || { echo "/opt/course/9/pulsar.log is missing or empty"; exit 1; }
printf '%s' "$log" | grep -q 'release channel: stable' \
  && echo "logs captured" \
  || { echo "log does not show the stable channel: $(printf '%s' "$log" | head -1)"; exit 1; }
