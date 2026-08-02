#!/usr/bin/env bash
# points: 2
# desc: CronJob log-rotate runs every 5 minutes, forbids overlap, keeps 2/1 history
set -uo pipefail
. /banks/_lib/checks.sh
out=$(kubectl -n vega get cronjob log-rotate \
  -o jsonpath='{.spec.schedule}|{.spec.concurrencyPolicy}|{.spec.successfulJobsHistoryLimit}|{.spec.failedJobsHistoryLimit}' 2>/dev/null)
[ "$out" = '*/5 * * * *|Forbid|2|1' ] && echo "schedule and history ok" || {
  echo "got '$out', want '*/5 * * * *|Forbid|2|1'"
  show_actual json "$(kubectl -n vega get cronjob log-rotate -o json 2>/dev/null | jq '.spec | {schedule, concurrencyPolicy, successfulJobsHistoryLimit, failedJobsHistoryLimit}')"
  show_why "These are four independent fields and three of them have defaults that are not what the question asks for. concurrencyPolicy defaults to Allow, which permits exactly the overlapping run the question forbids — Forbid skips the new run while the old one is going, and Replace would kill the running one instead. The two history limits (3 and 1 by default) decide how many finished Job objects and their Pods are kept before the controller deletes them. A value missing from the pane was never set, so its default is in force."
  exit 1
}
