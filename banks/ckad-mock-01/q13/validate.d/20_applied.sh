#!/usr/bin/env bash
# points: 4
# desc: the overlay was applied to pavo and is running
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual text "$(kubectl -n pavo get deploy,svc 2>/dev/null)"
  show_why "$1"
}

img=$(kubectl -n pavo get deploy staging-cargo-api \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].image}' 2>/dev/null)
[ "$img" = "nginx:1.29-alpine" ] || {
  echo "deployed image is '$img', want nginx:1.29-alpine"
  evidence "An overlay can render perfectly and still not be in the cluster — building it and applying it are two separate acts. Applying a kustomization directory works the way applying a file does, and until it runs, this Namespace holds whatever was there before."
  exit 1
}

ready=$(kubectl -n pavo get deploy staging-cargo-api -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "$ready" = "3" ] || {
  echo "readyReplicas is '$ready', want 3"
  evidence "The Deployment is there but not all of its Pods are ready. If the rendered replica count was right, this is the rollout still settling or an image that cannot be pulled."
  exit 1
}

kubectl -n pavo get svc staging-cargo-api >/dev/null 2>&1 || {
  echo "Service staging-cargo-api is missing from namespace pavo"
  evidence "The base carries a Service as well as a Deployment, so building the overlay renders both and applying it creates both. Only one of them arrived, which usually means the manifests were applied by hand instead of through the kustomization."
  exit 1
}
echo "applied and running"
