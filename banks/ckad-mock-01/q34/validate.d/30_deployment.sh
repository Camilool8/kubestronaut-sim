#!/usr/bin/env bash
# points: 2
# desc: the rendered Deployment runs 3 ready replicas of nginx:1.27-alpine
# expected: image.json json
set -uo pipefail
. /banks/_lib/checks.sh

img=$(kubectl -n caelum get deploy object-cache \
  -o jsonpath='{.spec.template.spec.containers[*].image}' 2>/dev/null)
ready=$(kubectl -n caelum get deploy object-cache -o jsonpath='{.status.readyReplicas}' 2>/dev/null)

# readyReplicas is a live rollout reading and rides on its own crit message
# below; the rendered image is the tag override reaching the Pod template.
snapshot() {
  jq -nS --arg img "${img:-}" '{image: (if $img == "" then null else $img end)}' 2>/dev/null
}

evidence() {
  show_pair json image.json
  show_why "$1"
}

crit 1 "the tag override was rendered into the Pod template" \
  "the Deployment runs '$img', want nginx:1.27-alpine" \
  "The chart builds this string from image.repository and image.tag together, so overriding only the tag keeps nginx as the repository and swaps the version. The release's APP VERSION column still reads the chart's appVersion and is metadata about the chart rather than about what it was told to run — read the Pod template, not the release listing." \
  -- [ "$img" = "nginx:1.27-alpine" ]

crit 1 "all 3 replicas are ready" \
  "readyReplicas is '$ready', want 3" \
  "The replica count is rendered from replicaCount into the Deployment's spec, and the cluster then has to satisfy it. A gap here is Pods still starting, or an image tag the nodes cannot fetch — this cluster is air-gapped, so a tag that is not already on the node never arrives." \
  -- [ "$ready" = "3" ]

crit_all_passed || evidence "$(crit_why)"
report "object-cache: 3/3 ready on nginx:1.27-alpine"
