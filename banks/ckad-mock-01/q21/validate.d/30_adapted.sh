#!/usr/bin/env bash
# points: 3
# desc: the adapter really rewrites the app's output into key/value lines
set -uo pipefail
# Read from inside the adapter, not the app: this is what proves the two
# containers actually share the volume. A Pod whose YAML mounts the same
# emptyDir at different paths, or whose adapter writes somewhere else,
# passes every structural check above and produces nothing here.
out=$(kubectl -n pictor exec telemetry -c adapter -- \
  cat /var/run/telemetry/metrics.prom 2>/dev/null)
[ -n "$out" ] || { echo "/var/run/telemetry/metrics.prom is missing or empty in the adapter"; exit 1; }

printf '%s' "$out" | grep -qx 'cpu 42' || { echo "no 'cpu 42' line; got: $(printf '%s' "$out" | tr '\n' '|')"; exit 1; }
printf '%s' "$out" | grep -qx 'mem 71' || { echo "no 'mem 71' line; got: $(printf '%s' "$out" | tr '\n' '|')"; exit 1; }
echo "adapter output ok"
