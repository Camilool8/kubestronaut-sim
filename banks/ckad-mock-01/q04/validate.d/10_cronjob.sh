#!/usr/bin/env bash
# points: 3
# desc: CronJob log-rotate runs every 5 minutes, forbids overlap, keeps 2/1 history
# expected: cronjob.json json
set -uo pipefail
. /banks/_lib/checks.sh

snapshot() {
  kubectl -n vega get cronjob log-rotate -o json 2>/dev/null \
    | jq -S '.spec | {schedule, concurrencyPolicy, successfulJobsHistoryLimit, failedJobsHistoryLimit}'
}

evidence() {
  show_pair json cronjob.json
  show_why "$1"
}

exists=$(kubectl -n vega get cronjob log-rotate -o jsonpath='{.metadata.name}' 2>/dev/null)
[ -n "$exists" ] || {
  echo "CronJob log-rotate not found in Namespace vega"
  show_actual text "$(kubectl -n vega get cronjob 2>/dev/null)"
  show_why "Every part of this question is graded on a CronJob named log-rotate in Namespace vega, and the pane above lists what that Namespace actually holds. A CronJob created under another name is invisible to every check here."
  exit 1
}

out=$(kubectl -n vega get cronjob log-rotate \
  -o jsonpath='{.spec.schedule}|{.spec.concurrencyPolicy}|{.spec.successfulJobsHistoryLimit}|{.spec.failedJobsHistoryLimit}' 2>/dev/null)
[ "$out" = '*/5 * * * *|Forbid|2|1' ] && echo "schedule and history ok" || {
  echo "got '$out', want '*/5 * * * *|Forbid|2|1'"
  evidence "These are four independent fields and three of them have defaults that are not what the question asks for. concurrencyPolicy defaults to Allow, which permits exactly the overlapping run the question forbids — Forbid skips the new run while the old one is going, and Replace would kill the running one instead. The two history limits (3 and 1 by default) decide how many finished Job objects and their Pods are kept before the controller deletes them. A value missing from the pane was never set, so its default is in force."
  exit 1
}
