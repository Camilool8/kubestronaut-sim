#!/usr/bin/env bash
# points: 2
# desc: emptyDir feed-logs mounted at /var/log/feed in both writer and shipper
set -uo pipefail
kind=$(kubectl -n lyra get deploy feed-writer \
  -o jsonpath='{.spec.template.spec.volumes[?(@.name=="feed-logs")].emptyDir}' 2>/dev/null)
[ -n "$kind" ] || { echo "no emptyDir volume named feed-logs"; exit 1; }

writer=$(kubectl -n lyra get deploy feed-writer \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="writer")].volumeMounts[?(@.name=="feed-logs")].mountPath}' 2>/dev/null)
shipper=$(kubectl -n lyra get deploy feed-writer \
  -o jsonpath='{.spec.template.spec.initContainers[?(@.name=="shipper")].volumeMounts[?(@.name=="feed-logs")].mountPath}' 2>/dev/null)
[ "$writer" = "/var/log/feed" ] || { echo "writer mounts feed-logs at '$writer'"; exit 1; }
[ "$shipper" = "/var/log/feed" ] || { echo "shipper mounts feed-logs at '$shipper'"; exit 1; }
echo "shared volume ok"
