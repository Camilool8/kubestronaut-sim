#!/usr/bin/env bash
# points: 2
# desc: Job backfill: 3 completions, parallelism 2, backoffLimit 2, container worker
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual json "$(kubectl -n vega get job backfill -o json 2>/dev/null | jq '{completions: .spec.completions, parallelism: .spec.parallelism, backoffLimit: .spec.backoffLimit, containers: [.spec.template.spec.containers[] | {name, image}]}')"
  show_why "$1"
}

out=$(kubectl -n vega get job backfill \
  -o jsonpath='{.spec.completions}|{.spec.parallelism}|{.spec.backoffLimit}' 2>/dev/null)
[ "$out" = "3|2|2" ] || {
  echo "completions|parallelism|backoffLimit is '$out', want '3|2|2'"
  evidence "completions is how many Pods must exit successfully before the Job is Complete, parallelism is how many of them may run at the same time, and backoffLimit is how many failures are tolerated before the Job gives up and is marked Failed. All three default (1, 1 and 6) and kubectl create job accepts none of them as flags, so this Job has to be written out rather than generated."
  exit 1
}

img=$(kubectl -n vega get job backfill \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="worker")].image}' 2>/dev/null)
[ -n "$img" ] && echo "job spec ok" || {
  echo "no container named 'worker' in the Job's Pod template"
  evidence "The container is found by name, and the question names it worker. A Pod template whose container is called something else describes a different workload as far as anything selecting by name is concerned."
  exit 1
}
