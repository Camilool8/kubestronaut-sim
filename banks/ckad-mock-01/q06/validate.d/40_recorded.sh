#!/usr/bin/env bash
# points: 1
# desc: the value the container sees for MAX_WORKERS is recorded on the instance
set -uo pipefail
# `< missing-file` fails in the shell, not in tr, so 2>/dev/null on tr
# alone still leaks "No such file or directory" into the check's message.
recorded=$(cat /opt/course/6/max-workers 2>/dev/null | tr -d '[:space:]')
[ "$recorded" = "8" ] \
  && echo "recorded ok" \
  || { echo "/opt/course/6/max-workers contains '$recorded', want 8"; exit 1; }
