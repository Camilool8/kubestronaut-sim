#!/usr/bin/env bash
# points: 2
# desc: the CronJob exists in lynx with its original schedule and command
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual yaml "$(kubectl -n lynx get cronjob nightly-report -o yaml 2>/dev/null | k8s_clean)"
  show_why "$1"
}

sched=$(kubectl -n lynx get cronjob nightly-report -o jsonpath='{.spec.schedule}' 2>/dev/null)
img=$(kubectl -n lynx get cronjob nightly-report \
  -o jsonpath='{.spec.jobTemplate.spec.template.spec.containers[?(@.name=="report")].image}' 2>/dev/null)

crit 1 "kept its original schedule" \
  "schedule is '$sched', want '0 2 * * *'" \
  "Moving a CronJob off the removed beta version is a pure version bump — the schema is identical, so the apiVersion line changes and nothing under it should. A schedule that came out different means the conversion changed behaviour, which is exactly what the question forbids. An empty pane means the manifest was never applied to this Namespace." \
  -- [ "$sched" = "0 2 * * *" ]

crit 1 "kept its original container and image" \
  "image is '$img', want busybox:1.37 — the conversion should not change behaviour" \
  "The container is found by name, so an empty result also means the container was renamed. Either way the conversion has altered what the object does, and the instruction was to change only what the current API requires." \
  -- [ "$img" = "busybox:1.37" ]

crit_all_passed || evidence "$(crit_why)"
report "cronjob ok"
