#!/usr/bin/env bash
# points: 1
# desc: Job backfill completed, and its succeeded count is recorded on the instance
set -uo pipefail
succeeded=$(kubectl -n vega get job backfill -o jsonpath='{.status.succeeded}' 2>/dev/null)
[ "$succeeded" = "3" ] || { echo "job succeeded count is '$succeeded', want 3"; exit 1; }
# cat, not `< file`: a missing file makes the *shell* print "No such file
# or directory", which 2>/dev/null on the reader alone does not suppress,
# and it ends up in the candidate's failure message.
recorded=$(cat /opt/course/4/backfill-succeeded 2>/dev/null | tr -d '[:space:]')
[ "$recorded" = "3" ] \
  && echo "job complete and recorded" \
  || { echo "/opt/course/4/backfill-succeeded contains '$recorded', want 3"; exit 1; }
