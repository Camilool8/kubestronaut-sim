#!/usr/bin/env bash
# points: 3
# desc: the rollout was resumed and the staged change really rolled out
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual text "$(kubectl -n pyxis get deploy feed-api \
    -o custom-columns='NAME:.metadata.name,PAUSED:.spec.paused,DESIRED:.spec.replicas,UPDATED:.status.updatedReplicas,READY:.status.readyReplicas' 2>/dev/null
    echo
    kubectl -n pyxis get rs 2>/dev/null)"
  show_why "$1"
}

paused=$(kubectl -n pyxis get deploy feed-api -o jsonpath='{.spec.paused}' 2>/dev/null)
want=$(kubectl -n pyxis get deploy feed-api -o jsonpath='{.spec.replicas}' 2>/dev/null)
updated=$(kubectl -n pyxis get deploy feed-api -o jsonpath='{.status.updatedReplicas}' 2>/dev/null)
img=$(kubectl -n pyxis get deploy feed-api \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].image}' 2>/dev/null)
sets=$(kubectl -n pyxis get rs -l app=feed-api -o json 2>/dev/null | jq '.items | length')

rolled_out() { [ -n "$want" ] && [ "$updated" = "$want" ] && [ "${sets:-0}" -ge 2 ] 2>/dev/null; }

# A Deployment nobody has touched is not paused either, so 'not paused' only
# means 'resumed' once there is a staged change to have been holding back.
let_out() { [ "$img" = "nginx:1.29-alpine" ] && [ "$paused" != "true" ]; }

crit 2 "the staged change is in the template and no longer held back" \
  "image is '$img' with spec.paused '$paused'; want nginx:1.29-alpine staged and the Deployment resumed" \
  "spec.paused stops the Deployment controller, not the API server, so every later edit is accepted and none of it reaches a Pod. That is why this reads the staged image and the pause together: a Deployment that was never paused and never edited is 'not paused' too. Resuming removes the field rather than writing false — the two mean the same thing to the controller, and only true stops it." \
  -- let_out

crit 1 "the staged change was rolled out, not just stored" \
  "updatedReplicas is '$updated' of '$want', across ${sets:-0} ReplicaSet(s)" \
  "A Deployment holds one ReplicaSet per Pod template it has rolled out, so a second one appearing IS the rollout. While paused there is one, carrying the old template and the old Pods; resuming creates the second, moves the Pods onto it and leaves the first scaled to zero as the rollback." \
  -- rolled_out

crit_all_passed || evidence "$(crit_why)"
report "resumed, and the new ReplicaSet carries the Pods"
