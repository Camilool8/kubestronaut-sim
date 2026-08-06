#!/usr/bin/env bash
# points: 1
# desc: the CronJob API version the cluster actually serves was recorded
set -uo pipefail
. /banks/_lib/checks.sh
got=$(cat /opt/course/18/cronjob-version 2>/dev/null | tr -d '[:space:]')
want=$(kubectl api-resources --api-group=batch -o wide 2>/dev/null \
  | awk '$NF == "CronJob" || $0 ~ /[[:space:]]CronJob[[:space:]]/ {print $3; exit}')
[ -n "$want" ] || want="batch/v1"
[ "$got" = "$want" ] && echo "version recorded" || {
  echo "/opt/course/18/cronjob-version contains '$got', want '$want'"
  show_actual text "$(kubectl api-resources --api-group=batch -o wide 2>/dev/null)"
  show_why "The cluster in front of you is the authority on which version it serves, and it will tell you offline: the resource listing above gives the group/version for every kind it knows. What is wanted in the file is that version string on its own — not the kind, not the plural resource name, and not the whole line."
  exit 1
}
