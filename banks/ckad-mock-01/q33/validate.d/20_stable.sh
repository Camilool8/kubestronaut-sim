#!/usr/bin/env bash
# points: 1
# desc: search-stable was scaled to 4 and still runs what it ran before
set -uo pipefail
. /banks/_lib/checks.sh

want=$(kubectl -n lupus get deploy search-stable -o jsonpath='{.spec.replicas}' 2>/dev/null)
ready=$(kubectl -n lupus get deploy search-stable -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
img=$(kubectl -n lupus get deploy search-stable \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="web")].image}' 2>/dev/null)

[ "$want" = "4" ] && [ "$ready" = "4" ] && [ "$img" = "nginx:1.27-alpine" ] && {
  echo "search-stable holds the other 4 fifths"
  exit 0
}

echo "search-stable: replicas='$want' ready='$ready' image='$img'; want 4, 4 and nginx:1.27-alpine"
show_actual json "$(kubectl -n lupus get deploy search-stable -o json 2>/dev/null \
  | jq '{replicas: .spec.replicas, ready: .status.readyReplicas,
         images: [.spec.template.spec.containers[].image]}')"
show_why "Capacity is the reason the stable Deployment moves. Adding a canary Pod on top of five leaves six Pods behind the Service — one sixth to the canary rather than one fifth, and 20% more capacity than the workload was sized for. Scaling stable to 4 keeps the total at 5 and makes the canary's share exactly one in five. The image is checked with it because the stable release is the control in this experiment: change what it runs and the trial compares nothing."
exit 1
