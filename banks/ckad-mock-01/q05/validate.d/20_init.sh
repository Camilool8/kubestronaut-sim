#!/usr/bin/env bash
# points: 2
# desc: init container wait-for-source exists, is not a sidecar, and mounts nothing
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

sel='{.spec.template.spec.initContainers[?(@.name=="wait-for-source")]'
names=$(kubectl -n lyra get deploy feed-writer \
  -o jsonpath='{.spec.template.spec.initContainers[*].name}' 2>/dev/null)
img=$(kubectl -n lyra get deploy feed-writer -o jsonpath="${sel}.image}" 2>/dev/null)
policy=$(kubectl -n lyra get deploy feed-writer -o jsonpath="${sel}.restartPolicy}" 2>/dev/null)
mounts=$(kubectl -n lyra get deploy feed-writer -o jsonpath="${sel}.volumeMounts[*].name}" 2>/dev/null)

# Both of the criteria below grade an ABSENCE, and an absence only counts when
# the thing it qualifies exists. Before feed-writer is written there is no
# wait-for-source, so it has no restartPolicy and no volumeMounts either — which
# scored a candidate who had done nothing two of these four weights.
exists_wfs() { has_name "$names" wait-for-source; }
plain_init_container() { exists_wfs && [ -z "$policy" ]; }
mounts_nothing() { exists_wfs && [ -z "$mounts" ]; }

crit 2 "an init container wait-for-source runs busybox:1.37" \
  "wait-for-source image is '$img'" \
  "There is no init container called wait-for-source carrying that image. Init containers are a list of their own beside containers, not a container with a flag set — an entry in the wrong list is a different thing entirely." \
  -- [ "$img" = "busybox:1.37" ]

crit 1 "it exists and is a plain init container, not a sidecar" \
  "wait-for-source has restartPolicy '$policy' (init containers: $(name_list "$names"))" \
  "restartPolicy: Always on an init container is what makes it a sidecar, and a sidecar never finishes. This container's job is to block until the Service answers and then exit, so with that field set the Pod would sit in Init forever and the main container would never start. A container that was never written is not a sidecar either, which is why this asks that wait-for-source be in the initContainers list before reading the field." \
  -- plain_init_container

crit 1 "it exists and mounts nothing" \
  "wait-for-source should mount nothing, mounts: '$mounts' (init containers: $(name_list "$names"))" \
  "This container only waits for the Service to answer; it produces nothing for anyone to read. The shared emptyDir belongs to writer and shipper, and mounting it here would claim a relationship the question does not describe. Mounting nothing is only an answer once there is a wait-for-source to mount nothing." \
  -- mounts_nothing

crit_all_passed || evidence "$(crit_why)"
report "init container ok"
