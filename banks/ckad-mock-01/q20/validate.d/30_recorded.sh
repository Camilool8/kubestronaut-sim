#!/usr/bin/env bash
# points: 1
# desc: the response body was saved on the instance
# expected: nodeport-check.txt text
set -uo pipefail
. /banks/_lib/checks.sh

snapshot() {
  cat /opt/course/20/nodeport-check 2>/dev/null
}

evidence() {
  show_pair text nodeport-check.txt
  show_why "$1"
}

got=$(cat /opt/course/20/nodeport-check 2>/dev/null | tr -d '[:space:]')
[ "$got" = "status-ok" ] && echo "response recorded" || {
  echo "/opt/course/20/nodeport-check contains '$got', want 'status-ok'"
  evidence "This records what the node port ANSWERED, so it can only be captured once it answers — the application replies with a single word. Curling the Service's cluster address instead produces the same word without ever proving the node port exists, which is the shortcut the question is built to catch."
  exit 1
}
