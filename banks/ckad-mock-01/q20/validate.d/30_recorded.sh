#!/usr/bin/env bash
# points: 1
# desc: the response body was saved on the instance
set -uo pipefail
got=$(cat /opt/course/20/nodeport-check 2>/dev/null | tr -d '[:space:]')
[ "$got" = "status-ok" ] \
  && echo "response recorded" \
  || { echo "/opt/course/20/nodeport-check contains '$got', want 'status-ok'"; exit 1; }
