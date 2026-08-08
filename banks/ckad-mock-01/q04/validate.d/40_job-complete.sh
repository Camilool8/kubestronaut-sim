#!/usr/bin/env bash
# points: 2
# desc: Job backfill completed, and its succeeded count is recorded on the instance
set -uo pipefail
. /banks/_lib/checks.sh
succeeded=$(kubectl -n vega get job backfill -o jsonpath='{.status.succeeded}' 2>/dev/null)
recorded=$(cat /opt/course/4/backfill-succeeded 2>/dev/null | tr -d '[:space:]')

crit 1 "the Job reached 3 successful completions" \
  "job succeeded count is '$succeeded', want 3" \
  "status.succeeded counts the Pods that have exited 0, and it reaches the requested completions only once every one of them has finished — a few seconds after the Job is created, which is what the wait in the question is for. A Job that stopped short either exhausted its backoffLimit or is still running." \
  -- [ "$succeeded" = "3" ]

crit 1 "the count was recorded on the instance" \
  "/opt/course/4/backfill-succeeded contains '$recorded', want 3" \
  "The number comes from the Job's own status, so it can only be recorded after the Job has completed. Digits only: a header row, a whole kubectl table or a line of prose is not the count, even when the count is somewhere inside it." \
  -- [ "$recorded" = "3" ]

crit_all_passed || {
  show_actual text "$(kubectl -n vega get job backfill 2>/dev/null; echo; kubectl -n vega get pod 2>/dev/null; echo; cat /opt/course/4/backfill-succeeded 2>/dev/null)"
  show_why "$(crit_why)"
}
report "job complete and recorded"
