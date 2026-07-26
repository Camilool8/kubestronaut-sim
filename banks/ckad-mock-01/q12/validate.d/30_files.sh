#!/usr/bin/env bash
# points: 2
# desc: the starting revision and the rollout history were saved on the instance
set -uo pipefail
before=$(cat /opt/course/12/revision-before 2>/dev/null | tr -d '[:space:]')
[ "$before" = "1" ] \
  || { echo "/opt/course/12/revision-before contains '$before', want 1"; exit 1; }

hist=$(cat /opt/course/12/history 2>/dev/null)
[ -n "$hist" ] || { echo "/opt/course/12/history is missing or empty"; exit 1; }
printf '%s' "$hist" | grep -q 'REVISION' \
  && printf '%s' "$hist" | grep -q 'upgrade to nginx 1.29' \
  && echo "files ok" \
  || { echo "/opt/course/12/history does not look like 'kubectl rollout history' output"; exit 1; }
