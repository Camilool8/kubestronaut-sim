#!/usr/bin/env bash
# points: 2
# desc: emptyDir feed-logs mounted at /var/log/feed in both writer and shipper
# expected: volumes.json json
set -uo pipefail
. /banks/_lib/checks.sh

snapshot() {
  jq -n --arg ed "$kind" --arg w "${writer:-}" --arg s "${shipper:-}" \
    '{feedLogsVolume: (if $ed == "" then null else "emptyDir" end),
      writerMountPath: (if $w == "" then null else $w end),
      shipperMountPath: (if $s == "" then null else $s end)}'
}

evidence() {
  show_pair json volumes.json
  show_why "$1"
}

exists=$(kubectl -n lyra get deploy feed-writer -o jsonpath='{.metadata.name}' 2>/dev/null)
[ -n "$exists" ] || {
  echo "Deployment feed-writer not found in Namespace lyra"
  show_actual text "$(kubectl -n lyra get deploy 2>/dev/null)"
  show_why "Every part of this question is graded on Deployment feed-writer in Namespace lyra, and the pane above lists what that Namespace actually holds. A Deployment created under another name is invisible to every check here."
  exit 1
}

kind=$(kubectl -n lyra get deploy feed-writer \
  -o jsonpath='{.spec.template.spec.volumes[?(@.name=="feed-logs")].emptyDir}' 2>/dev/null)
[ -n "$kind" ] || {
  echo "no emptyDir volume named feed-logs"
  show_actual json "$(kubectl -n lyra get deploy feed-writer -o json 2>/dev/null | jq -S '.spec.template.spec.volumes // []')"
  show_why "A volume is declared once at Pod level and mounted separately by every container that wants it. emptyDir is created empty when the Pod is scheduled and disappears with it, which is what makes it the right scratch space for one container to write and another to read. The pane above lists every volume the Pod template actually declares."
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
