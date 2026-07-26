#!/usr/bin/env bash
# points: 2
# desc: shipper is a native sidecar (initContainers entry with restartPolicy Always)
set -uo pipefail
# The whole point of the question: a sidecar declared the modern way
# lives in initContainers and carries restartPolicy: Always. A second
# entry under .spec.containers would pass a naive "is there a container
# called shipper" check while being a different thing entirely.
policy=$(kubectl -n lyra get deploy feed-writer \
  -o jsonpath='{.spec.template.spec.initContainers[?(@.name=="shipper")].restartPolicy}' 2>/dev/null)
[ "$policy" = "Always" ] \
  || { echo "shipper is not a native sidecar (initContainers restartPolicy='$policy')"; exit 1; }

if kubectl -n lyra get deploy feed-writer \
  -o jsonpath='{.spec.template.spec.containers[*].name}' 2>/dev/null | grep -qw shipper; then
  echo "shipper is also under .spec.containers — it must only be a sidecar"
  exit 1
fi
echo "native sidecar ok"
