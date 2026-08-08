#!/usr/bin/env bash
# points: 2
# desc: feed-api ends on nginx:1.29-alpine with 3 ready replicas
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual text "$(kubectl -n pyxis get deploy feed-api -o wide 2>/dev/null; echo; kubectl -n pyxis get pods 2>/dev/null)"
  show_why "$1"
}

img=$(kubectl -n pyxis get deploy feed-api \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].image}' 2>/dev/null)
ready=$(kubectl -n pyxis get deploy feed-api -o jsonpath='{.status.readyReplicas}' 2>/dev/null)

kubectl -n pyxis get deploy feed-api >/dev/null 2>&1 || {
  echo "Deployment feed-api is gone from namespace pyxis"
  evidence "The task stages a change on this Deployment and then releases it. Deleting and recreating it reaches a similar-looking cluster with no rollout history and no paused revision, which is the whole subject of the question."
  exit 1
}

crit 1 "runs the approved image" \
  "image is '$img', want nginx:1.29-alpine" \
  "The image belongs to the container in the Deployment's Pod template. A paused Deployment accepts that edit and stores it exactly as an unpaused one would — pausing changes what the CONTROLLER does with the template, never whether the write lands." \
  -- [ "$img" = "nginx:1.29-alpine" ]

# 3 ready replicas is where the Deployment started, so it grades nothing on its
# own. It grades the end state the question asks for once they are ready ON the
# approved image.
on_new_image_and_ready() { [ "$img" = "nginx:1.29-alpine" ] && [ "$ready" = "3" ]; }

crit 1 "all 3 replicas are ready on it" \
  "image is '$img' with readyReplicas '$ready'; want 3 replicas ready on nginx:1.29-alpine" \
  "status.readyReplicas is what the cluster has, not what spec.replicas asked for — and it has to be 3 on the NEW image, which is the whole end state the question describes. A Deployment left paused sits at three ready replicas forever: the new Pod template is stored, no ReplicaSet is created for it, and the old Pods stay ready while nothing reports an error." \
  -- on_new_image_and_ready

crit_all_passed || evidence "$(crit_why)"
report "feed-api is on nginx:1.29-alpine, 3/3 ready"
