#!/usr/bin/env bash
# points: 2
# desc: /opt/course/27/cpu-request holds the CPU request the Pod was given
# expected: cpu-request.txt text
set -uo pipefail
. /banks/_lib/checks.sh

f=/opt/course/27/cpu-request
got=$(file_text "$f")

snapshot() {
  printf '%s' "${got:-}"
}

evidence() {
  show_pair text cpu-request.txt
  show_why "$1"
}

[ -n "$got" ] || {
  echo "$f is missing or empty"
  show_why "This answer is a file on the instance rather than a command that was run once, so the value has to be redirected to that path. Nothing is there at all."
  exit 1
}
[ "$(milli "$got")" = "100" ] && { echo "cpu request recorded"; exit 0; }

echo "$f holds '$got', want the effective CPU request (100m)"
evidence "The file wants the quantity on its own — 100m, or 0.1, which is the same amount — and nothing else. A whole JSON object, a key name in front of it or the value the manifest asked for (which was nothing) all land here. Read it off the Pod with a jsonpath ending at the container's resources.requests.cpu."
exit 1
