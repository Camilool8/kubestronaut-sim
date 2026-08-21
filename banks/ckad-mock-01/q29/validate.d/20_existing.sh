#!/usr/bin/env bash
# points: 2
# desc: /opt/course/29/existing-toggle names the resource that was already in sextans
# expected: existing-toggle.txt text
set -uo pipefail
. /banks/_lib/checks.sh

f=/opt/course/29/existing-toggle
want=legacy-checkout
got=$(file_text "$f")

# The pane pairs the file's own content, not a live listing of what exists in
# sextans right now — that listing would include dark-mode once part 3 is
# done, which is not what this file is graded on. The listing itself is
# still worth pointing at, so it stays in the why text below instead.
snapshot() {
  printf '%s' "${got:-}"
}

evidence() {
  show_pair text existing-toggle.txt
  show_why "$1"
}

[ -n "$got" ] || {
  echo "$f is missing or empty"
  show_why "Nothing was written to that path. Once the type is registered it lists like any other namespaced resource, so finding what is already there is a plain get in the Namespace the question named."
  exit 1
}
[ "$got" = "$want" ] && { echo "existing resource recorded"; exit 0; }

echo "$f holds '$got', want the name of the resource already in sextans"
evidence "Listing FeatureToggles in sextans names every resource that exists there right now, which by this point includes the one you created. The one this file wants is whichever of those was already there before you added anything — the name alone, without the kind in front of it."
exit 1
