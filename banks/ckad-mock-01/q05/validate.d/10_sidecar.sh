#!/usr/bin/env bash
# points: 2
# desc: shipper is a native sidecar (initContainers entry with restartPolicy Always)
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual json "$(kubectl -n lyra get deploy feed-writer -o json 2>/dev/null | jq '.spec.template.spec | {initContainers: [.initContainers[]? | {name, restartPolicy}], containers: [.containers[] | {name}]}')"
  show_expected json "/banks/${BANK:-ckad-mock-01}/q05/expected/containers.json"
  show_why "$1"
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
