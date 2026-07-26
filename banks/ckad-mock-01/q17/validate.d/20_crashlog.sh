#!/usr/bin/env bash
# points: 3
# desc: the dead container's own log message was captured
set -uo pipefail
# The container is gone by the time anyone looks, so this line is only
# reachable through `kubectl logs --previous`. Its presence is the proof
# the right tool was used.
grep -q 'FATAL: cache directory /var/cache/corvus is unavailable' /opt/course/17/crash.log 2>/dev/null \
  && echo "crash log captured" \
  || { echo "/opt/course/17/crash.log does not contain the container's failure message"; exit 1; }
