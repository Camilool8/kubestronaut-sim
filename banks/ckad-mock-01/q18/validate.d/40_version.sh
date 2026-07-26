#!/usr/bin/env bash
# points: 1
# desc: the CronJob API version the cluster actually serves was recorded
set -uo pipefail
got=$(cat /opt/course/18/cronjob-version 2>/dev/null | tr -d '[:space:]')
# Read the answer from the cluster rather than hardcoding it, so this
# check keeps working when the served version moves on.
want=$(kubectl api-resources --api-group=batch -o wide 2>/dev/null \
  | awk '$NF == "CronJob" || $0 ~ /[[:space:]]CronJob[[:space:]]/ {print $3; exit}')
[ -n "$want" ] || want="batch/v1"
[ "$got" = "$want" ] \
  && echo "version recorded" \
  || { echo "/opt/course/18/cronjob-version contains '$got', want '$want'"; exit 1; }
