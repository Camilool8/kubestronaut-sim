#!/usr/bin/env bash
# points: 2
# desc: ConfigMaps app-tuning (2 literals) and app-limits (from limits.conf)
set -uo pipefail
. /banks/_lib/checks.sh
level=$(kubectl -n atlas get cm app-tuning -o jsonpath='{.data.LOG_LEVEL}' 2>/dev/null)
workers=$(kubectl -n atlas get cm app-tuning -o jsonpath='{.data.MAX_WORKERS}' 2>/dev/null)
[ "$level" = "debug" ] || { echo "app-tuning LOG_LEVEL='$level', want 'debug'"; exit 1; }
[ "$workers" = "8" ] || { echo "app-tuning MAX_WORKERS='$workers', want '8'"; exit 1; }

# --from-file names the key after the file's basename; --from-file with
# an explicit key, or a hand-written manifest, are equally fine as long
# as the key and the contents match.
value=$(kubectl -n atlas get cm app-limits -o jsonpath='{.data.limits\.conf}' 2>/dev/null)
[ -n "$value" ] || { echo "app-limits has no key 'limits.conf'"; exit 1; }
# Spacing around the `=` is not part of the answer — see 30_volume.sh.
contains_kv "$value" "max_connections" "512" \
  || { echo "app-limits/limits.conf does not contain max_connections=512"; exit 1; }
echo "configmaps ok"
