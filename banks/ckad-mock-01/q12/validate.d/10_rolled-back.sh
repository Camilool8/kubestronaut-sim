#!/usr/bin/env bash
# points: 2
# desc: payments-api is back on nginx:1.27-alpine with 4 ready replicas
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual text "$(kubectl -n draco get deploy payments-api 2>/dev/null; echo; kubectl -n draco rollout history deploy payments-api 2>/dev/null)"
  show_why "$1"
}

img=$(kubectl -n draco get deploy payments-api \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].image}' 2>/dev/null)
spec=$(kubectl -n draco get deploy payments-api -o jsonpath='{.spec.replicas}' 2>/dev/null)
ready=$(kubectl -n draco get deploy payments-api -o jsonpath='{.status.readyReplicas}' 2>/dev/null)

crit 1 "back on nginx:1.27-alpine" \
  "image is '$img', want nginx:1.27-alpine" \
  "A rollback restores the POD TEMPLATE of an earlier revision — image, env, probes, everything the ReplicaSet was created from — and the image is the visible part of that. Reaching the old tag by editing the image back arrives at the same string without ever using the history, which is what the revision count beside this check exists to tell apart." \
  -- [ "$img" = "nginx:1.27-alpine" ]

crit 1 "still scaled to 4" \
  "spec.replicas is '$spec', want 4" \
  "Scaling is not part of a revision, so rolling back does not undo it — the replica count you set survives the rollback untouched. Expecting an undo to restore the old count is one of the more expensive surprises this object has to offer." \
  -- [ "$spec" = "4" ]

crit 1 "all 4 replicas ready" \
  "readyReplicas is '$ready', want 4" \
  "spec.replicas is what was asked for; status.readyReplicas is what the cluster actually has. The gap is Pods still starting, or Pods that cannot start — a rollout that has not finished settling reads exactly like this for a few seconds." \
  -- [ "$ready" = "4" ]

crit_all_passed || evidence "$(crit_why)"
report "rolled back, 4/4 ready"
