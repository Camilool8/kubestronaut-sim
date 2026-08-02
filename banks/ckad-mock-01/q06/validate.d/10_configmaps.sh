#!/usr/bin/env bash
# points: 2
# desc: ConfigMaps app-tuning (2 literals) and app-limits (from limits.conf)
set -uo pipefail
. /banks/_lib/checks.sh
level=$(kubectl -n atlas get cm app-tuning -o jsonpath='{.data.LOG_LEVEL}' 2>/dev/null)
workers=$(kubectl -n atlas get cm app-tuning -o jsonpath='{.data.MAX_WORKERS}' 2>/dev/null)
tuning() {
  show_actual yaml "$(kubectl -n atlas get cm app-tuning -o yaml 2>/dev/null | k8s_clean)"
  show_why "$1"
}
limits() {
  show_actual yaml "$(kubectl -n atlas get cm app-limits -o yaml 2>/dev/null | k8s_clean)"
  show_why "$1"
}

[ "$level" = "debug" ] || {
  echo "app-tuning LOG_LEVEL='$level', want 'debug'"
  tuning "Each literal becomes one entry in the ConfigMap's data map, and the KEY is what the container will later see as the environment variable's name — which is why the question spells them in capitals. An empty pane means no ConfigMap called app-tuning exists in atlas."
  exit 1
}
[ "$workers" = "8" ] || {
  echo "app-tuning MAX_WORKERS='$workers', want '8'"
  tuning "The second entry is missing or holds something else. Both values are strings as far as the ConfigMap is concerned — everything in data is text, which is also why a bare number in a hand-written manifest has to be quoted."
  exit 1
}

# --from-file names the key after the file's basename; --from-file with
# an explicit key, or a hand-written manifest, are equally fine as long
# as the key and the contents match.
value=$(kubectl -n atlas get cm app-limits -o jsonpath='{.data.limits\.conf}' 2>/dev/null)
[ -n "$value" ] || {
  echo "app-limits has no key 'limits.conf'"
  limits "Creating a ConfigMap from a file names the key after that file's basename, which is how the key comes out as limits.conf. The key matters because it becomes the FILENAME when the ConfigMap is mounted as a volume — a key named after the full path, or after the ConfigMap, produces a file nothing is looking for."
  exit 1
}
# Spacing around the `=` is not part of the answer — see 30_volume.sh.
contains_kv "$value" "max_connections" "512" || {
  echo "app-limits/limits.conf does not contain max_connections=512"
  limits "The whole file is the value of that one key — a ConfigMap made from a file holds it as a single string, not as one entry per setting inside it. What is stored here does not carry the setting the seeded file had."
  exit 1
}
echo "configmaps ok"
