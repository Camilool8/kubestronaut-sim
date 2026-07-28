#!/usr/bin/env bash
# points: 3
# desc: app-limits mounted read-only at /etc/app, and the file is really there
set -uo pipefail
. /banks/_lib/checks.sh
src=$(kubectl -n atlas get pod tuned \
  -o jsonpath='{.spec.volumes[?(@.name=="limits")].configMap.name}' 2>/dev/null)
[ "$src" = "app-limits" ] || { echo "volume 'limits' is not backed by app-limits (got '$src')"; exit 1; }

path=$(kubectl -n atlas get pod tuned \
  -o jsonpath='{.spec.containers[?(@.name=="web")].volumeMounts[?(@.name=="limits")].mountPath}' 2>/dev/null)
ro=$(kubectl -n atlas get pod tuned \
  -o jsonpath='{.spec.containers[?(@.name=="web")].volumeMounts[?(@.name=="limits")].readOnly}' 2>/dev/null)
[ "$path" = "/etc/app" ] || { echo "mountPath is '$path', want '/etc/app'"; exit 1; }
[ "$ro" = "true" ] || { echo "mount is not readOnly (got '$ro')"; exit 1; }

# Declared and actually projected are different things — a wrong key or a
# subPath typo passes every check above and still leaves no file.
#
# Spacing around the `=` is not part of the answer: --from-file preserves
# the seeded file byte for byte, but a candidate who created the
# ConfigMap by retyping `max_connections=512` has configured exactly the
# same thing. Was a literal `grep -q 'max_connections = 512'`.
projected=$(kubectl -n atlas exec tuned -c web -- cat /etc/app/limits.conf 2>/dev/null)
contains_kv "$projected" "max_connections" "512" \
  || { echo "/etc/app/limits.conf is not readable inside the container, or lacks max_connections=512"; exit 1; }
echo "volume ok"
