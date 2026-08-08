#!/usr/bin/env bash
# points: 2
# desc: emptyDir feed-logs mounted at /var/log/feed in both writer and shipper
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual json "$(kubectl -n lyra get deploy feed-writer -o json 2>/dev/null | jq '.spec.template.spec | {volumes, mounts: [(.containers[]?, .initContainers[]?) | {name, volumeMounts}]}')"
  show_why "$1"
}

kind=$(kubectl -n lyra get deploy feed-writer \
  -o jsonpath='{.spec.template.spec.volumes[?(@.name=="feed-logs")].emptyDir}' 2>/dev/null)
[ -n "$kind" ] || {
  echo "no emptyDir volume named feed-logs"
  evidence "A volume is declared once at Pod level and mounted separately by every container that wants it. emptyDir is created empty when the Pod is scheduled and disappears with it, which is what makes it the right scratch space for one container to write and another to read."
  exit 1
}

writer=$(kubectl -n lyra get deploy feed-writer \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="writer")].volumeMounts[?(@.name=="feed-logs")].mountPath}' 2>/dev/null)
shipper=$(kubectl -n lyra get deploy feed-writer \
  -o jsonpath='{.spec.template.spec.initContainers[?(@.name=="shipper")].volumeMounts[?(@.name=="feed-logs")].mountPath}' 2>/dev/null)
crit 1 "writer mounts it at /var/log/feed" \
  "writer mounts feed-logs at '$writer'" \
  "Declaring the volume is not mounting it: each container needs its own volumeMounts entry, and both have to use the same path for one to read the file the other wrote. writer appends its timestamps to a file under this directory." \
  -- [ "$writer" = "/var/log/feed" ]

crit 1 "shipper mounts it at the same path" \
  "shipper mounts feed-logs at '$shipper'" \
  "The sidecar tails the file writer produces, so it needs the same volume at the same path. Its volumeMounts belong on its initContainers entry, which is where a native sidecar is declared — mounted anywhere else, tail -F waits on a file that will never appear." \
  -- [ "$shipper" = "/var/log/feed" ]

crit_all_passed || evidence "$(crit_why)"
report "shared volume ok"
