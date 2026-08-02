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

# Membership and ordering are checked separately, and reported
# separately. This was one `diff`, which made a trailing space or a CRLF
# indistinguishable from listing the wrong namespaces — the candidate got
# "list content mismatch" and no way to tell which of the two they had
# done, on a check they may well have passed.
if ! same_set "$expected" "$got"; then
  echo "wrong namespaces."
  echo "  want: $(printf '%s' "$expected" | tr '\n' ' ')"
  echo "  got:  $(printf '%s' "$got" | tr '\n' ' ')"
  show_actual text "$(cat "$f" 2>/dev/null)"
  show_why "The list is defined by a label, not by a name: every Namespace carrying team=aurora belongs in it, and one created without that label never appears in a query for it. Names only, so the resource/ prefix kubectl prints for -o name is not part of the answer either."
  exit 1
fi

# The question does ask for sorted output, so it is still graded — just
# as its own, nameable failure rather than hidden inside a diff.
actual_order=$(tr -d '\r' < "$f" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | grep -v '^$')
if [ "$actual_order" != "$expected" ]; then
  echo "the right namespaces, but not in sorted order"
  show_actual text "$actual_order"
  show_why "The members are right and only their order is wrong. Ordering is a property of the file you saved rather than of the cluster: the API returns Namespaces in its own order, so the sort has to happen on the way to the file."
  exit 1
fi
echo "list matches"
