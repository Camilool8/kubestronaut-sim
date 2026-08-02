#!/usr/bin/env bash
# points: 1
# desc: the response body was saved on the instance
set -uo pipefail
. /banks/_lib/checks.sh
got=$(cat /opt/course/20/nodeport-check 2>/dev/null | tr -d '[:space:]')
[ "$got" = "status-ok" ] && echo "response recorded" || {
  echo "/opt/course/20/nodeport-check contains '$got', want 'status-ok'"
  show_actual text "$(cat /opt/course/20/nodeport-check 2>/dev/null)"
  show_why "This records what the node port ANSWERED, so it can only be captured once it answers — the application replies with a single word. Curling the Service's cluster address instead produces the same word without ever proving the node port exists, which is the shortcut the question is built to catch."
  exit 1
}
