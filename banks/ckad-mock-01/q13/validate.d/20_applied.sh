#!/usr/bin/env bash
# points: 3
# desc: the overlay was applied to pavo and is running
# expected: none — every criterion here re-reads the LIVE cluster to see
#           whether the overlay already paired in 10_overlay.sh actually
#           reached it and is running: image delivery, replica readiness and
#           Service presence are readings taken at a moment, not a second
#           document for the same authored shape.
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual text "$(kubectl -n pavo get deploy,svc 2>/dev/null)"
  show_why "$1"
}

img=$(kubectl -n pavo get deploy staging-cargo-api \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].image}' 2>/dev/null)
ready=$(kubectl -n pavo get deploy staging-cargo-api -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
svc_exists() { kubectl -n pavo get svc staging-cargo-api >/dev/null 2>&1; }

crit 2 "the overlay's image reached the cluster" \
  "deployed image is '$img', want nginx:1.29-alpine" \
  "An overlay can render perfectly and still not be in the cluster — building it and applying it are two separate acts. Applying a kustomization directory works the way applying a file does, and until it runs, this Namespace holds whatever was there before." \
  -- [ "$img" = "nginx:1.29-alpine" ]

crit 1 "all 3 replicas ready" \
  "readyReplicas is '$ready', want 3" \
  "The Deployment is there but not all of its Pods are ready. If the rendered replica count was right, this is the rollout still settling or an image that cannot be pulled." \
  -- [ "$ready" = "3" ]

crit 1 "the Service came with it" \
  "Service staging-cargo-api is missing from namespace pavo" \
  "The base carries a Service as well as a Deployment, so building the overlay renders both and applying it creates both. Only one of them arriving usually means the manifests were applied by hand instead of through the kustomization." \
  -- svc_exists

crit_all_passed || evidence "$(crit_why)"
report "applied and running"
