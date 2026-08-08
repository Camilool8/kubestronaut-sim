#!/usr/bin/env bash
# points: 2
# desc: init container wait-for-source exists, is not a sidecar, and mounts nothing
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual json "$(kubectl -n lyra get deploy feed-writer -o json 2>/dev/null | jq '[.spec.template.spec.initContainers[]? | {name, image, restartPolicy, volumeMounts}]')"
  show_why "$1"
}

sel='{.spec.template.spec.initContainers[?(@.name=="wait-for-source")]'
img=$(kubectl -n lyra get deploy feed-writer -o jsonpath="${sel}.image}" 2>/dev/null)
policy=$(kubectl -n lyra get deploy feed-writer -o jsonpath="${sel}.restartPolicy}" 2>/dev/null)
mounts=$(kubectl -n lyra get deploy feed-writer -o jsonpath="${sel}.volumeMounts[*].name}" 2>/dev/null)

crit 2 "an init container wait-for-source runs busybox:1.37" \
  "wait-for-source image is '$img'" \
  "There is no init container called wait-for-source carrying that image. Init containers are a list of their own beside containers, not a container with a flag set — an entry in the wrong list is a different thing entirely." \
  -- [ "$img" = "busybox:1.37" ]

crit 1 "it is a plain init container, not a sidecar" \
  "wait-for-source has restartPolicy '$policy'; it must be a plain init container" \
  "restartPolicy: Always on an init container is what makes it a sidecar, and a sidecar never finishes. This container's job is to block until the Service answers and then exit, so with that field set the Pod would sit in Init forever and the main container would never start." \
  -- [ -z "$policy" ]

crit 1 "it mounts nothing" \
  "wait-for-source should mount nothing, mounts: '$mounts'" \
  "This container only waits for the Service to answer; it produces nothing for anyone to read. The shared emptyDir belongs to writer and shipper, and mounting it here would claim a relationship the question does not describe." \
  -- [ -z "$mounts" ]

crit_all_passed || evidence "$(crit_why)"
report "init container ok"
