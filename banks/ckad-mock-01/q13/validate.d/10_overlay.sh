#!/usr/bin/env bash
# points: 5
# desc: the overlay itself renders the prefix, label, image and replica count
set -uo pipefail
# Rendering the overlay, rather than only inspecting the cluster, is what
# distinguishes "completed the overlay" from "hand-wrote the manifests and
# applied them". Read-only: kustomize build touches nothing.
out=$(kubectl kustomize /opt/course/13/overlays/staging 2>&1)
[ $? -eq 0 ] || { echo "kubectl kustomize failed: $(printf '%s' "$out" | head -2)"; exit 1; }

dep=$(printf '%s' "$out" | yq 'select(.kind == "Deployment")' - 2>/dev/null)
svc=$(printf '%s' "$out" | yq 'select(.kind == "Service")' - 2>/dev/null)
[ -n "$dep" ] || { echo "the overlay renders no Deployment"; exit 1; }

name=$(printf '%s' "$dep" | yq -r '.metadata.name')
svcname=$(printf '%s' "$svc" | yq -r '.metadata.name')
[ "$name" = "staging-cargo-api" ] || { echo "Deployment renders as '$name', want staging-cargo-api"; exit 1; }
[ "$svcname" = "staging-cargo-api" ] || { echo "Service renders as '$svcname', want staging-cargo-api"; exit 1; }

img=$(printf '%s' "$dep" | yq -r '.spec.template.spec.containers[0].image')
reps=$(printf '%s' "$dep" | yq -r '.spec.replicas')
label=$(printf '%s' "$dep" | yq -r '.metadata.labels.tier // ""')
[ "$img" = "nginx:1.29-alpine" ] || { echo "rendered image is '$img', want nginx:1.29-alpine"; exit 1; }
[ "$reps" = "3" ] || { echo "rendered replicas is '$reps', want 3"; exit 1; }
[ "$label" = "staging" ] || { echo "rendered tier label is '$label', want staging"; exit 1; }
echo "overlay renders correctly"
