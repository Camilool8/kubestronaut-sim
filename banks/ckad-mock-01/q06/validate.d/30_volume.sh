#!/usr/bin/env bash
# points: 3
# desc: app-limits mounted read-only at /etc/app, and the file is really there
set -uo pipefail
. /banks/_lib/checks.sh
src=$(kubectl -n atlas get pod tuned \
  -o jsonpath='{.spec.volumes[?(@.name=="limits")].configMap.name}' 2>/dev/null)
evidence() {
  show_actual json "$(kubectl -n atlas get pod tuned -o json 2>/dev/null | jq --arg c web '
    {volumes: .spec.volumes,
     mounts: (if any(.spec.containers[]; .name == $c)
              then first(.spec.containers[] | select(.name == $c)) | .volumeMounts
              else {"no such container": $c, "containers that exist": [.spec.containers[].name]}
              end)}')"
  show_why "$1"
}

# Both halves of this check address things by the names the question gave them.
# Report a name that does not exist as such, rather than as a field that is set
# to nothing.
vols=$(kubectl -n atlas get pod tuned -o jsonpath='{.spec.volumes[*].name}' 2>/dev/null)
has_name "$vols" limits || {
  echo "pod tuned has no volume named 'limits' (found: $(name_list "$vols"))"
  evidence "A volume's name is the handle its mount refers to, and the question fixes it at 'limits'. Naming the volume after the ConfigMap it carries is the common habit and works perfectly at runtime, but this check looks the volume up by the name it was told to expect, so a different one is invisible to it."
  exit 1
}

path=$(kubectl -n atlas get pod tuned \
  -o jsonpath='{.spec.containers[?(@.name=="web")].volumeMounts[?(@.name=="limits")].mountPath}' 2>/dev/null)
ro=$(kubectl -n atlas get pod tuned \
  -o jsonpath='{.spec.containers[?(@.name=="web")].volumeMounts[?(@.name=="limits")].readOnly}' 2>/dev/null)
projected=$(kubectl -n atlas exec tuned -c web -- cat /etc/app/limits.conf 2>/dev/null)

# The last criterion looks inside the container, so it gets its own pane.
inside() {
  show_actual text "$(kubectl -n atlas exec tuned -c web -- ls -l /etc/app 2>/dev/null)"
  show_why "$1"
}
pane=''

crit 1 "backed by ConfigMap app-limits" \
  "volume 'limits' is not backed by app-limits (got '$src')" \
  "The volume's own name is only a handle the container's mount refers to; configMap.name is what says which ConfigMap supplies the contents. Each key in that ConfigMap becomes one file in the mounted directory." \
  -- [ "$src" = "app-limits" ] || pane=${pane:-evidence}

crit 1 "mounted at /etc/app" \
  "mountPath is '$path', want '/etc/app'" \
  "mountPath is the directory the ConfigMap's keys appear in as files, and mounting over a directory hides whatever the image had there. The question pins the path because that is where the application expects to read its file." \
  -- [ "$path" = "/etc/app" ] || pane=${pane:-evidence}

crit 1 "mounted read-only" \
  "mount is not readOnly (got '$ro')" \
  "readOnly on the mount is asked for explicitly. Configuration projected from a ConfigMap is refreshed by the kubelet and any local edit would be silently overwritten, so making the mount read-only states the intent rather than leaving a writable path that never keeps a write." \
  -- [ "$ro" = "true" ] || pane=${pane:-evidence}

crit 1 "the file is really there inside the container" \
  "/etc/app/limits.conf is not readable inside the container, or lacks max_connections=512" \
  "Declared and actually projected are different things. The files that appear in the mounted directory are named after the ConfigMap's KEYS, so a key named anything other than limits.conf produces a directory with a file nobody asked for — and a subPath mount projects one key and hides the rest. An empty listing means nothing was mounted there at all." \
  -- contains_kv "$projected" "max_connections" "512" || pane=${pane:-inside}

crit_all_passed || "${pane:-evidence}" "$(crit_why)"
report "volume ok"
