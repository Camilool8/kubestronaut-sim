#!/usr/bin/env bash
# points: 1
# desc: /opt/course/3/endpoints records the ready endpoint count, the number alone
# expected: endpoints.txt text
set -uo pipefail
. /banks/_lib/checks.sh

f=/opt/course/3/endpoints
[ -f "$f" ] || {
  echo "$f not found"
  show_why "This part of the answer is a file on the instance rather than a command run once: the count has to be written to that path. Nothing exists there at all."
  exit 1
}

got=$(file_text "$f")
digits=$(printf '%s' "$got" | tr -dc '0-9')
bare_number() { [ -n "$digits" ] && [ "$got" = "$digits" ]; }

snapshot() {
  printf '%s' "${got:-}"
}

crit 1 "records the ready endpoint count" \
  "$f reads '$got', want 2" \
  "The count is the number of endpoints the fixed Service lists as READY, and the Deployment runs 2 replicas. A 0 is the count taken while the Service still selected nothing, and a count taken from the Pods rather than from the Service's own endpoint list can agree by accident while proving nothing about the Service." \
  -- [ "$digits" = "2" ]

crit 1 "the number alone, nothing else" \
  "$f reads '$got', which carries more than the number" \
  "The question asks for the number on its own, so the file holds a bare count rather than a copy of the command's table or a sentence around it. Surrounding whitespace and a trailing newline are fine; other text is not." \
  -- bare_number

crit_all_passed || {
  show_pair text endpoints.txt
  show_why "$(crit_why)"
}
report "endpoint count recorded"
