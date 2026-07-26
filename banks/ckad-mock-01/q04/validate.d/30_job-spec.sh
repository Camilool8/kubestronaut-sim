#!/usr/bin/env bash
# points: 2
# desc: Job backfill: 3 completions, parallelism 2, backoffLimit 2, container worker
set -uo pipefail
out=$(kubectl -n vega get job backfill \
  -o jsonpath='{.spec.completions}|{.spec.parallelism}|{.spec.backoffLimit}|{.spec.template.spec.containers[0].name}' 2>/dev/null)
[ "$out" = "3|2|2|worker" ] \
  && echo "job spec ok" \
  || { echo "got '$out', want '3|2|2|worker'"; exit 1; }
