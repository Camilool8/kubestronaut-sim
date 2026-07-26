#!/usr/bin/env bash
# points: 2
# desc: CronJob log-rotate runs every 5 minutes, forbids overlap, keeps 2/1 history
set -uo pipefail
out=$(kubectl -n vega get cronjob log-rotate \
  -o jsonpath='{.spec.schedule}|{.spec.concurrencyPolicy}|{.spec.successfulJobsHistoryLimit}|{.spec.failedJobsHistoryLimit}' 2>/dev/null)
[ "$out" = '*/5 * * * *|Forbid|2|1' ] \
  && echo "schedule and history ok" \
  || { echo "got '$out', want '*/5 * * * *|Forbid|2|1'"; exit 1; }
