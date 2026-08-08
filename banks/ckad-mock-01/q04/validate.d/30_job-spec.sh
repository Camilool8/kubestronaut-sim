#!/usr/bin/env bash
# points: 3
# desc: Job backfill: 3 completions, parallelism 2, backoffLimit 2, container worker
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual json "$(kubectl -n vega get job backfill -o json 2>/dev/null | jq '{completions: .spec.completions, parallelism: .spec.parallelism, backoffLimit: .spec.backoffLimit, containers: [.spec.template.spec.containers[] | {name, image}]}')"
  show_why "$1"
}

names=$(kubectl -n vega get job backfill \
  -o jsonpath='{.spec.template.spec.containers[*].name}' 2>/dev/null)
has_name "$names" worker || {
  echo "no container named 'worker' in the Job's Pod template (found: $(name_list "$names"))"
  evidence "The container is found by name, and the question names it worker. A Pod template whose container is called something else describes a different workload as far as anything selecting by name is concerned."
  exit 1
}

field() { kubectl -n vega get job backfill -o jsonpath="{.spec.$1}" 2>/dev/null; }
completions=$(field completions); parallelism=$(field parallelism); backoff=$(field backoffLimit)

crit 1 "3 completions" \
  "completions is '$completions', want 3" \
  "completions is how many Pods must exit successfully before the Job is Complete. It defaults to 1 and kubectl create job accepts no flag for it, so this Job has to be written out rather than generated." \
  -- [ "$completions" = "3" ]

crit 1 "parallelism 2" \
  "parallelism is '$parallelism', want 2" \
  "parallelism is how many of the Job's Pods may run at the same time — the difference between three Pods one after another and three at once. It defaults to 1." \
  -- [ "$parallelism" = "2" ]

crit 1 "backoffLimit 2" \
  "backoffLimit is '$backoff', want 2" \
  "backoffLimit is how many failures are tolerated before the Job gives up and is marked Failed. It defaults to 6, so leaving it alone means a broken Job retries far longer than the question asks." \
  -- [ "$backoff" = "2" ]

crit_all_passed || evidence "$(crit_why)"
report "job spec ok"
