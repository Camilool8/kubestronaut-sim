#!/usr/bin/env bash
# points: 4
# desc: Deployment helios-web in scutum runs 3 ready replicas on nginx:1.29-alpine
# expected: rollout.json json
set -uo pipefail
. /banks/_lib/checks.sh

img=$(kubectl -n scutum get deploy helios-web \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="web")].image}' 2>/dev/null)
reps=$(kubectl -n scutum get deploy helios-web -o jsonpath='{.spec.replicas}' 2>/dev/null)
ready=$(kubectl -n scutum get deploy helios-web -o jsonpath='{.status.readyReplicas}' 2>/dev/null)

# replicas and the web container's image are what the kustomize transformers
# set; readyReplicas is a live rollout reading and rides on its own crit
# message below instead of a second pane.
snapshot() {
  jq -nS --arg reps "${reps:-}" --arg img "${img:-}" '
    { replicas: (if $reps == "" then null else $reps end),
      image: (if $img == "" then null else $img end) }
  ' 2>/dev/null
}

evidence() {
  show_pair json rollout.json
  show_why "$1"
}

kubectl -n scutum get deploy helios-web >/dev/null 2>&1 || {
  echo "no Deployment helios-web in namespace scutum"
  show_actual text "$(kubectl -n scutum get deploy,svc 2>/dev/null)"
  show_why "Rendering an overlay and applying it are two separate acts: kubectl kustomize prints what the build produces and changes nothing, while apply -k sends it to the API. Nothing of this app has reached the Namespace at all. The overlay already pins namespace: scutum, so no -n is needed on the apply, and the name comes from the base — nothing in this task renames it."
  exit 1
}

crit 2 "the image transformer reached the cluster" \
  "deployed image is '$img', want nginx:1.29-alpine" \
  "The images transformer matches on the image NAME as the base writes it — the bare repository, without the tag — and swaps the tag through newTag; matching against the fully tagged string finds nothing and the transformer silently does no work. This is read from the live Deployment, so an overlay that renders the right tag but was never applied looks exactly like one that was never edited." \
  -- [ "$img" = "nginx:1.29-alpine" ]

crit 1 "scaled to 3 replicas" \
  "spec.replicas is '$reps', want 3" \
  "The replicas transformer matches a resource by its own name as the base spells it, and it is applied before any renaming an overlay does — so a count that names something the base never called it matches nothing and quietly changes no replica count at all." \
  -- [ "$reps" = "3" ]

crit 1 "all 3 replicas are ready" \
  "readyReplicas is '${ready:-0}', want 3" \
  "The replica count is set but not every Pod is running and ready. With the count right this is either a rollout still settling or an image tag that cannot be pulled — the two nginx tags this question uses are the ones the bank preloads, so a tag that is neither of them has nowhere to come from on a cluster with no route to a registry." \
  -- [ "$ready" = "3" ]

crit_all_passed || evidence "$(crit_why)"
report "helios-web rolled out"
