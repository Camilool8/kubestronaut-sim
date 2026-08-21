#!/usr/bin/env bash
# points: 2
# desc: ConfigMaps app-tuning (2 literals) and app-limits (from limits.conf)
# expected: configmaps.json json
set -uo pipefail
. /banks/_lib/checks.sh
level=$(kubectl -n atlas get cm app-tuning -o jsonpath='{.data.LOG_LEVEL}' 2>/dev/null)
workers=$(kubectl -n atlas get cm app-tuning -o jsonpath='{.data.MAX_WORKERS}' 2>/dev/null)
value=$(kubectl -n atlas get cm app-limits -o jsonpath='{.data.limits\.conf}' 2>/dev/null)

snapshot() {
  jq -n -S \
    --arg level "${level:-}" --arg workers "${workers:-}" --arg conf "${value:-}" \
    '{
      "app-tuning": {LOG_LEVEL: (if $level == "" then null else $level end), MAX_WORKERS: (if $workers == "" then null else $workers end)},
      "app-limits": {"limits.conf": (if $conf == "" then null else $conf end)}
    }' 2>/dev/null
}

evidence() {
  show_pair json configmaps.json
  show_why "$1"
}

crit 1 "app-tuning holds LOG_LEVEL=debug" \
  "app-tuning LOG_LEVEL='$level', want 'debug'" \
  "Each literal becomes one entry in the ConfigMap's data map, and the KEY is what the container will later see as the environment variable's name — which is why the question spells them in capitals. A null LOG_LEVEL above means no ConfigMap called app-tuning exists in atlas at all." \
  -- [ "$level" = "debug" ]

crit 1 "app-tuning holds MAX_WORKERS=8" \
  "app-tuning MAX_WORKERS='$workers', want '8'" \
  "The second entry is missing or holds something else. Both values are strings as far as the ConfigMap is concerned — everything in data is text, which is also why a bare number in a hand-written manifest has to be quoted." \
  -- [ "$workers" = "8" ]

crit 1 "app-limits is keyed limits.conf" \
  "app-limits has no key 'limits.conf'" \
  "Creating a ConfigMap from a file names the key after that file's basename, which is how the key comes out as limits.conf. The key matters because it becomes the FILENAME when the ConfigMap is mounted as a volume — a key named after the full path, or after the ConfigMap, produces a file nothing is looking for." \
  -- [ -n "$value" ]

crit 1 "and carries the file's contents unchanged" \
  "app-limits/limits.conf does not contain max_connections=512" \
  "The whole file is the value of that one key — a ConfigMap made from a file holds it as a single string, not as one entry per setting inside it. What is stored here does not carry the setting the seeded file had." \
  -- contains_kv "$value" "max_connections" "512"

crit_all_passed || evidence "$(crit_why)"
report "configmaps ok"
