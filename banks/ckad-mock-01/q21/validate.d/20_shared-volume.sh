#!/usr/bin/env bash
# points: 3
# desc: an emptyDir named telemetry is mounted at /var/run/telemetry in both containers
# expected: shared-volume.json json
set -uo pipefail
. /banks/_lib/checks.sh

snapshot() {
  kubectl -n pictor get pod telemetry -o json 2>/dev/null \
    | jq -S '{telemetryVolume: ((.spec.volumes[]? | select(.name == "telemetry") | (.emptyDir // {})) // null),
              mounts: ([.spec.containers[]? | {name, mountPath: ((.volumeMounts[]? | select(.name == "telemetry") | .mountPath) // null)}] | sort_by(.name))}' 2>/dev/null
}

evidence() {
  show_pair json shared-volume.json
  show_why "$1"
}

kind=$(kubectl -n pictor get pod telemetry \
  -o jsonpath='{.spec.volumes[?(@.name=="telemetry")].emptyDir}' 2>/dev/null)

crit 2 "an emptyDir named telemetry" \
  "no emptyDir volume named telemetry" \
  "The volume is declared once at Pod level and mounted separately by each container that wants it. emptyDir is the shared scratch space the whole pattern rests on: one container writes a file into it and the other reads that file, with no network and no coordination between them." \
  -- [ -n "$kind" ]

for c in app adapter; do
  path=$(kubectl -n pictor get pod telemetry \
    -o jsonpath="{.spec.containers[?(@.name==\"${c}\")].volumeMounts[?(@.name==\"telemetry\")].mountPath}" 2>/dev/null)
  crit 1 "${c} mounts it at /var/run/telemetry" \
    "container ${c} mounts telemetry at '$path', want /var/run/telemetry" \
    "Sharing means the same volume at the same path in BOTH containers. Mounted at two different paths they are still sharing storage and the adapter is still reading a directory the app never wrote to, which looks identical from the outside and produces nothing." \
    -- [ "$path" = "/var/run/telemetry" ]
done

crit_all_passed || evidence "$(crit_why)"
report "shared volume ok"
