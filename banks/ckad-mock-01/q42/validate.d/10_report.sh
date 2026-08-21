#!/usr/bin/env bash
# points: 4
# desc: the report carries the three named columns and a correct line per Deployment
# expected: report.txt text
set -uo pipefail
. /banks/_lib/checks.sh

# Column widths are kubectl's padding, not the candidate's answer, so every
# comparison below is made against whitespace-collapsed lines.
squeeze() {
  tr -d '\r' < "$1" 2>/dev/null \
    | sed -e 's/[[:space:]][[:space:]]*/ /g' -e 's/^ //' -e 's/ $//' \
    | grep -v '^$'
}

lines=$(squeeze /opt/course/42/report)
[ -n "$lines" ] || {
  echo "/opt/course/42/report is missing or empty"
  show_actual text "$(kubectl -n antlia get deploy 2>/dev/null)"
  show_why "The report is a file on the instance, written from the output of one kubectl command. Above is the default listing of the same Deployments — the task is to reshape it into the three named columns and redirect it."
  exit 1
}

head_line=$(printf '%s\n' "$lines" | head -1 | tr '[:lower:]' '[:upper:]')
body=$(printf '%s\n' "$lines" | tail -n +2)

snapshot() {
  printf '%s\n' "${lines:-}"
}

evidence() {
  show_pair text report.txt
  show_why "$1"
}

row_present() {
  local want=$1 line
  while IFS= read -r line; do
    [ "$line" = "$want" ] && return 0
  done <<EOF
$body
EOF
  return 1
}

crit 1 "the header names the three columns in order" \
  "the first line reads '$head_line', want 'NAME REPLICAS IMAGE'" \
  "A custom-columns argument is a list of HEADING:path pairs, and the heading half is printed exactly as it was typed — so the header line is a direct readout of the column list, in the order it was written. A header of NAMESPACE NAME READY is the default listing, which means the output format never changed at all." \
  -- [ "$head_line" = "NAME REPLICAS IMAGE" ]

crit 1 "search-indexer, 1 replica" \
  "no line reads 'search-indexer 1 busybox:1.37'" \
  "REPLICAS is the desired count on the spec, which is the number the Deployment was created with. status.replicas and status.readyReplicas are what is actually there at this instant and are a different column." \
  -- row_present "search-indexer 1 busybox:1.37"

crit 1 "audit-writer, 2 replicas" \
  "no line reads 'audit-writer 2 busybox:1.37'" \
  "Two of these four Deployments share an image, so the IMAGE column is not a second copy of the name. It comes from the first container of the Pod template, not from any running Pod." \
  -- row_present "audit-writer 2 busybox:1.37"

crit 1 "image-resizer, 3 replicas" \
  "no line reads 'image-resizer 3 nginx:1.27-alpine'" \
  "The image column wants the whole reference including the tag, exactly as the Pod template carries it. Two of these Deployments run nginx on different tags, so a column built from the repository alone cannot tell them apart." \
  -- row_present "image-resizer 3 nginx:1.27-alpine"

crit 1 "billing-api, 4 replicas" \
  "no line reads 'billing-api 4 nginx:1.29-alpine'" \
  "A field path that matches nothing prints <none> in that cell rather than failing the command, so a column of <none> down the report is a typo in the path and not an empty cluster." \
  -- row_present "billing-api 4 nginx:1.29-alpine"

crit_all_passed || evidence "$(crit_why)"
report "report columns ok"
