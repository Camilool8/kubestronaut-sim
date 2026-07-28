#!/usr/bin/env bash
# points: 2
# desc: Job backfill: 3 completions, parallelism 2, backoffLimit 2, container worker
set -uo pipefail
out=$(kubectl -n vega get job backfill \
  -o jsonpath='{.spec.completions}|{.spec.parallelism}|{.spec.backoffLimit}' 2>/dev/null)
[ "$out" = "3|2|2" ] \
  || { echo "completions|parallelism|backoffLimit is '$out', want '3|2|2'"; exit 1; }

# The container is checked by name rather than by position, and its
# presence is the assertion: an empty result means there is no container
# called `worker` at all.
img=$(kubectl -n vega get job backfill \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="worker")].image}' 2>/dev/null)
[ -n "$img" ] \
  && echo "job spec ok" \
  || { echo "no container named 'worker' in the Job's Pod template"; exit 1; }
