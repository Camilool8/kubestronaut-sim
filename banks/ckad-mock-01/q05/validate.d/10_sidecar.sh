#!/usr/bin/env bash
# points: 3
# desc: shipper is a native sidecar (initContainers entry with restartPolicy Always)
# expected: containers.json json
set -uo pipefail
. /banks/_lib/checks.sh

snapshot() {
  kubectl -n lyra get deploy feed-writer -o json 2>/dev/null | jq -S '
    .spec.template.spec | {
      initContainers: [(.initContainers // [])[] | {name, image, restartPolicy: (.restartPolicy // null), volumeMounts: [(.volumeMounts // [])[] | .name]}],
      containers: [(.containers // [])[] | {name}]
    }'
}

evidence() {
  show_pair json containers.json
  show_why "$1"
}

exists=$(kubectl -n lyra get deploy feed-writer -o jsonpath='{.metadata.name}' 2>/dev/null)
[ -n "$exists" ] || {
  echo "Deployment feed-writer not found in Namespace lyra"
  show_actual text "$(kubectl -n lyra get deploy 2>/dev/null)"
  show_why "Every part of this question is graded on Deployment feed-writer in Namespace lyra, and the pane above lists what that Namespace actually holds. A Deployment created under another name is invisible to every check here."
  exit 1
}

policy=$(kubectl -n lyra get deploy feed-writer \
  -o jsonpath='{.spec.template.spec.initContainers[?(@.name=="shipper")].restartPolicy}' 2>/dev/null)
[ "$policy" = "Always" ] || {
  echo "shipper is not a native sidecar (initContainers restartPolicy='$policy')"
  evidence "A native sidecar is an entry in initContainers carrying restartPolicy: Always, and that one field is the whole difference. It is what makes the container start before the main one, keep running alongside it instead of having to exit, be restarted on its own if it dies, and be shut down last so it can ship the final lines. Without the restartPolicy the same entry is an ordinary init container that must finish before anything else starts."
  exit 1
}

mains=$(kubectl -n lyra get deploy feed-writer \
  -o jsonpath='{.spec.template.spec.containers[*].name}' 2>/dev/null)
if has_name "$mains" shipper; then
  echo "shipper is also under .spec.containers — it must only be a sidecar"
  evidence "Declared under containers, shipper is an ordinary container: it starts in parallel with writer rather than before it, and it is killed at the same time rather than after. The log tailing appears to work anyway, which is exactly why this is worth being strict about — tail -F survives the file not existing yet."
  exit 1
fi
echo "native sidecar ok"
