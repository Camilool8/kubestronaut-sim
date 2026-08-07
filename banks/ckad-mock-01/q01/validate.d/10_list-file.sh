#!/usr/bin/env bash
# points: 3
# desc: /opt/course/1/aurora-namespaces lists team=aurora namespaces, sorted, names only
set -uo pipefail
. /banks/_lib/checks.sh
f=/opt/course/1/aurora-namespaces
[ -f "$f" ] || {
  echo "$f not found"
  show_why "The answer to this part is a file on the instance, not a command you ran once: the query has to be redirected to that path. Nothing exists there at all."
  exit 1
}

expected=$(kubectl get ns -l team=aurora -o name | cut -d/ -f2 | sort)
got=$(file_lines_sorted "$f")
actual_order=$(tr -d '\r' < "$f" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | grep -v '^$')

crit 2 "lists exactly the team=aurora Namespaces" \
  "$(printf 'wrong namespaces.\n  want: %s\n  got:  %s' \
      "$(printf '%s' "$expected" | tr '\n' ' ')" "$(printf '%s' "$got" | tr '\n' ' ')")" \
  "The list is defined by a label, not by a name: every Namespace carrying team=aurora belongs in it, and one created without that label never appears in a query for it. Names only, so the resource/ prefix kubectl prints for -o name is not part of the answer either." \
  -- same_set "$expected" "$got"

crit 1 "sorted" \
  "the namespaces are not in sorted order" \
  "Ordering is a property of the file you saved rather than of the cluster: the API returns Namespaces in its own order, so the sort has to happen on the way to the file." \
  -- [ "$actual_order" = "$expected" ]

crit_all_passed || {
  show_actual text "$(cat "$f" 2>/dev/null)"
  show_why "$(crit_why)"
}
report "list matches"
