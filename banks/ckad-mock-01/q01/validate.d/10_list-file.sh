#!/usr/bin/env bash
# points: 3
# desc: /opt/course/1/aurora-namespaces lists team=aurora namespaces, sorted, names only
set -uo pipefail
f=/opt/course/1/aurora-namespaces
[ -f "$f" ] || { echo "$f not found"; exit 1; }
expected=$(kubectl get ns -l team=aurora -o name | cut -d/ -f2 | sort)
if diff <(printf '%s\n' "$expected") <(grep -v '^[[:space:]]*$' "$f") >/dev/null; then
  echo "list matches"
else
  echo "list content mismatch"; exit 1
fi
