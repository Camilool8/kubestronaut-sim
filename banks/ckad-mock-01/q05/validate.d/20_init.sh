#!/usr/bin/env bash
# points: 1
# desc: init container wait-for-source exists, is not a sidecar, and mounts nothing
set -uo pipefail
sel='{.spec.template.spec.initContainers[?(@.name=="wait-for-source")]'
img=$(kubectl -n lyra get deploy feed-writer -o jsonpath="${sel}.image}" 2>/dev/null)
[ "$img" = "busybox:1.37" ] || { echo "wait-for-source image is '$img'"; exit 1; }

# A restartPolicy here would make it a sidecar too, and it would never
# finish — the question asks for a true init container that exits.
policy=$(kubectl -n lyra get deploy feed-writer -o jsonpath="${sel}.restartPolicy}" 2>/dev/null)
[ -z "$policy" ] || { echo "wait-for-source has restartPolicy '$policy'; it must be a plain init container"; exit 1; }

mounts=$(kubectl -n lyra get deploy feed-writer -o jsonpath="${sel}.volumeMounts[*].name}" 2>/dev/null)
[ -z "$mounts" ] || { echo "wait-for-source should mount nothing, mounts: '$mounts'"; exit 1; }
echo "init container ok"
