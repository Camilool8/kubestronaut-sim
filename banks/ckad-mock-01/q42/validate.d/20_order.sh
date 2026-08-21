#!/usr/bin/env bash
# points: 3
# desc: the report holds one row per Deployment, ordered by ascending replica count
# expected: report.txt text
set -uo pipefail
. /banks/_lib/checks.sh

squeeze() {
  tr -d '\r' < "$1" 2>/dev/null \
    | sed -e 's/[[:space:]][[:space:]]*/ /g' -e 's/^ //' -e 's/ $//' \
    | grep -v '^$'
}

lines=$(squeeze /opt/course/42/report)
[ -n "$lines" ] || {
  echo "/opt/course/42/report is missing or empty"
  show_why "There is nothing to order yet. The report has to exist before its row order can be graded."
  exit 1
}

names=$(printf '%s\n' "$lines" | tail -n +2 | cut -d' ' -f1 | tr '\n' ' ' | sed -e 's/ $//')
count=$(printf '%s\n' "$lines" | tail -n +2 | grep -c .)
want='search-indexer audit-writer image-resizer billing-api'

snapshot() {
  cat /opt/course/42/report 2>/dev/null
}

evidence() {
  show_pair text report.txt
  show_why "$1"
}

crit 1 "one row per Deployment and no extras" \
  "the report has $count rows below the header, want 4" \
  "There are four Deployments in this Namespace and the file was to hold the header and one line each. A fifth line is usually a blank one at the end of a heredoc or an echoed total; a missing line is a filter that was never asked for." \
  -- [ "$count" = "4" ]

crit 2 "rows ascend by replica count" \
  "the rows read '$names', want '$want'" \
  "Sorting is a flag on the get, applied to the object list before a single line is printed, so it needs no pipe and no second pass over the output. It sorts by the field's own type: an integer field ascends numerically, which is why 4 lands last here rather than between 3 and anything beginning with a smaller digit. Untouched, the list comes back in name order, which puts audit-writer first." \
  -- [ "$names" = "$want" ]

crit_all_passed || evidence "$(crit_why)"
report "report ordered"
