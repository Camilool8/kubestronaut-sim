#!/usr/bin/env bash
# points: 4
# desc: the overlay itself renders the prefix, label, image and replica count
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual yaml "$out"
  show_why "$1"
}

out=$(kubectl kustomize /opt/course/13/overlays/staging 2>&1)
[ $? -eq 0 ] || {
  echo "kubectl kustomize failed: $(printf '%s' "$out" | head -2)"
  show_actual text "$out"
  show_why "The overlay does not build at all, and the error above names the field. Building it is free and touches nothing, so it is the fastest way to see what a kustomization actually produces before applying anything — every field in a kustomization.yaml is validated strictly, and an unknown or misspelled key is refused rather than ignored."
  exit 1
}

dep=$(printf '%s' "$out" | yq 'select(.kind == "Deployment")' - 2>/dev/null)
svc=$(printf '%s' "$out" | yq 'select(.kind == "Service")' - 2>/dev/null)
[ -n "$dep" ] || {
  echo "the overlay renders no Deployment"
  evidence "The build produced no Deployment, which means the base is not being included: an overlay lists the base under resources, and without it there is nothing to transform and the build renders only whatever the overlay itself declares."
  exit 1
}

name=$(printf '%s' "$dep" | yq -r '.metadata.name')
svcname=$(printf '%s' "$svc" | yq -r '.metadata.name')
img=$(printf '%s' "$dep" | yq -r '.spec.template.spec.containers[] | select(.name == "api") | .image')
reps=$(printf '%s' "$dep" | yq -r '.spec.replicas')
label=$(printf '%s' "$dep" | yq -r '.metadata.labels.tier // ""')

crit 1 "namePrefix reaches the Deployment" \
  "Deployment renders as '$name', want staging-cargo-api" \
  "namePrefix rewrites the name of every resource in the build and fixes up the references between them — which is why the Service still finds the Deployment's Pods after both have been renamed. It is a transformer, not a text edit on the base." \
  -- [ "$name" = "staging-cargo-api" ]

crit 1 "and the Service too" \
  "Service renders as '$svcname', want staging-cargo-api" \
  "The prefix applies to EVERY resource the build renders, not only the Deployment. A Service that came out unprefixed means it is not coming through the same overlay." \
  -- [ "$svcname" = "staging-cargo-api" ]

crit 1 "the images transformer set the tag" \
  "rendered image is '$img', want nginx:1.29-alpine" \
  "The images transformer matches on the image NAME as written in the base — the bare repository, not the full reference with its tag — and replaces the tag through newTag. Matching against the tagged string finds nothing and the transformer silently does no work; newName is the separate field for changing the repository." \
  -- [ "$img" = "nginx:1.29-alpine" ]

crit 1 "the replicas transformer took effect" \
  "rendered replicas is '$reps', want 3" \
  "The replicas transformer matches the resource's ORIGINAL name, as the base spells it, because transformers see resources before namePrefix has been applied. Naming the prefixed resource here matches nothing and the override quietly does nothing at all — which is the single most common way this task goes wrong." \
  -- [ "$reps" = "3" ]

crit 1 "the tier=staging label was added" \
  "rendered tier label is '$label', want staging" \
  "The labels transformer adds the pair to every resource it renders. Whether it is ALSO injected into the Deployment's selector.matchLabels is a separate switch, and it matters: selectors are immutable after creation, so injecting one into a Deployment that already exists makes every later apply fail." \
  -- [ "$label" = "staging" ]

crit_all_passed || evidence "$(crit_why)"
report "overlay renders correctly"
