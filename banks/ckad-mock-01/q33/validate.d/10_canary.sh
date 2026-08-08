#!/usr/bin/env bash
# points: 3
# desc: search-canary runs one Pod of nginx:1.29-alpine labelled into the Service
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual json "$(kubectl -n lupus get deploy search-canary -o json 2>/dev/null \
    | jq '{replicas: .spec.replicas, ready: .status.readyReplicas,
           selector: .spec.selector.matchLabels,
           templateLabels: .spec.template.metadata.labels,
           images: [.spec.template.spec.containers[].image]}')"
  show_why "$1"
}

kubectl -n lupus get deploy search-canary >/dev/null 2>&1 || {
  echo "Deployment search-canary does not exist in namespace lupus"
  show_actual text "$(kubectl -n lupus get deploy 2>/dev/null)"
  show_why "The canary is a second Deployment alongside the stable one, not a change to it. Both are owned separately, scaled separately and rolled back separately — which is the point: the trial can be removed without touching the release that is serving everybody else."
  exit 1
}

spec=$(kubectl -n lupus get deploy search-canary -o json 2>/dev/null)
img=$(printf '%s' "$spec" | jq -r '[.spec.template.spec.containers[].image] | join(",")')
app=$(printf '%s' "$spec" | jq -r '.spec.template.metadata.labels.app // ""')
track=$(printf '%s' "$spec" | jq -r '.spec.template.metadata.labels.track // ""')
ready=$(printf '%s' "$spec" | jq -r '.status.readyReplicas // 0')

labelled() { [ "$app" = "search" ] && [ "$track" = "canary" ]; }

crit 1 "runs the version being trialled" \
  "container image is '$img', want nginx:1.29-alpine" \
  "The canary exists to put a specific new version in front of a slice of real traffic. Running the same image as the stable Deployment splits the traffic between two identical things and measures nothing." \
  -- [ "$img" = "nginx:1.29-alpine" ]

crit 1 "its Pods carry app=search and track=canary" \
  "Pod template labels are app='$app' track='$track', want app=search and track=canary" \
  "app=search is what the Service already selects on, so it is what puts these Pods into the same endpoint list as the stable ones — that is the entire wiring. track=canary keeps the two Deployments' matchLabels disjoint, without which the canary's ReplicaSet would adopt the stable Pods and the two controllers would delete each other's work, and it is also the handle that gets you this version's logs on their own." \
  -- labelled

crit 1 "exactly one canary Pod is ready" \
  "search-canary has $ready ready replica(s), want 1" \
  "One Pod in five is the 20% the question asks for. The count is not a detail of the answer here, it IS the answer: a Service has no weighting of any kind, so the proportion is decided purely by how many ready Pods of each kind are behind it." \
  -- [ "$ready" = "1" ]

crit_all_passed || evidence "$(crit_why)"
report "canary running one Pod of nginx:1.29-alpine"
