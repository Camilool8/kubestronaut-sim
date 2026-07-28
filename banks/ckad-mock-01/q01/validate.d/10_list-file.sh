#!/usr/bin/env bash
# points: 3
# desc: /opt/course/1/aurora-namespaces lists team=aurora namespaces, sorted, names only
set -uo pipefail
. /banks/_lib/checks.sh
f=/opt/course/1/aurora-namespaces
[ -f "$f" ] || { echo "$f not found"; exit 1; }

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
  exit 1
fi

# The question does ask for sorted output, so it is still graded — just
# as its own, nameable failure rather than hidden inside a diff.
actual_order=$(tr -d '\r' < "$f" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | grep -v '^$')
if [ "$actual_order" != "$expected" ]; then
  echo "the right namespaces, but not in sorted order"
  exit 1
fi
echo "list matches"
