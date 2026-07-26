#!/usr/bin/env bash
# points: 1
# desc: the response body was saved on the instance
set -uo pipefail
got=$(cat /opt/course/19/service-check 2>/dev/null | tr -d '[:space:]')
[ "$got" = "inventory" ] \
  && echo "response recorded" \
  || { echo "/opt/course/19/service-check contains '$got', want 'inventory'"; exit 1; }
