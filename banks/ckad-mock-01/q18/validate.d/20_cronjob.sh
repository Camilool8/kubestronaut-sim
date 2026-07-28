#!/usr/bin/env bash
# points: 2
# desc: the CronJob exists in lynx with its original schedule and command
set -uo pipefail
sched=$(kubectl -n lynx get cronjob nightly-report -o jsonpath='{.spec.schedule}' 2>/dev/null)
[ "$sched" = "0 2 * * *" ] || { echo "schedule is '$sched', want '0 2 * * *'"; exit 1; }

img=$(kubectl -n lynx get cronjob nightly-report \
  -o jsonpath='{.spec.jobTemplate.spec.template.spec.containers[?(@.name=="report")].image}' 2>/dev/null)
[ "$img" = "busybox:1.37" ] \
  && echo "cronjob ok" \
  || { echo "image is '$img', want busybox:1.37 — the conversion should not change behaviour"; exit 1; }
