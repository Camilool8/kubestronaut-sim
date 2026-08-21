#!/usr/bin/env bash
# points: 1
# desc: the response body was saved on the instance
# expected: service-check.txt text
set -uo pipefail
. /banks/_lib/checks.sh

snapshot() {
  cat /opt/course/19/service-check 2>/dev/null
}

evidence() {
  show_pair text service-check.txt
  show_why "$1"
}

got=$(cat /opt/course/19/service-check 2>/dev/null | tr -d '[:space:]')
[ "$got" = "inventory" ] && echo "response recorded" || {
  echo "/opt/course/19/service-check contains '$got', want 'inventory'"
  evidence "This records what the Service ANSWERED, so it can only be captured once the Service actually answers — the application replies with a single word. An empty file is the request having failed, and a file full of escape characters is a TTY having been allocated for a command whose output was being redirected to a file."
  exit 1
}
