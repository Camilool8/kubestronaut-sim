#!/usr/bin/env bash
# points: 2
# desc: the crash-looping Pod was identified by name
set -uo pipefail
got=$(cat /opt/course/17/crashing-pod 2>/dev/null | tr -d '[:space:]')
[ "$got" = "cache-worker" ] \
  && echo "identified" \
  || { echo "/opt/course/17/crashing-pod contains '$got', want cache-worker"; exit 1; }
