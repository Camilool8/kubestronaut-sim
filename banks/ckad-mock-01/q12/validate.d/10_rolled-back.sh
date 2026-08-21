#!/usr/bin/env bash
# points: 2
# desc: payments-api is back on nginx:1.27-alpine with 4 ready replicas
# expected: none — the check grades a rollback round trip: the image tag is
#           only meaningful matched against the Deployment's own revision
#           counter, since the tag alone is as true of a Deployment nobody
#           touched as of one that was upgraded and rolled back — that is a
#           relationship between two live values, not a document. The
#           replica counts beside it are readings taken at a moment too.
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
rev=$(kubectl -n draco get deploy payments-api \
  -o jsonpath='{.metadata.annotations.deployment\.kubernetes\.io/revision}' 2>/dev/null)

# This is a round trip: the image it ends on is the image it started on, so the
# tag alone is as true of a Deployment nobody touched as of a finished answer.
# The revision counter is what separates the two — an upgrade and an undo leave
# it at 3 or more, and nothing at all leaves it at 1.
came_back() { [ "$img" = "nginx:1.27-alpine" ] && [ -n "$rev" ] && [ "$rev" -ge 3 ] 2>/dev/null; }

crit 1 "back on nginx:1.27-alpine, having been off it" \
  "image is '$img' at revision '$rev'; want nginx:1.27-alpine arrived at by an upgrade and a rollback (revision 3 or more)" \
  "A rollback restores the POD TEMPLATE of an earlier revision — image, env, probes, everything the ReplicaSet was created from — and the image is the visible part of that. The tag on its own says nothing here, because it is the tag the Deployment started on: what is graded is that it went to 1.29 and came back. Editing the image back by hand arrives at the same string without ever using the history and leaves the revision at 2." \
  -- came_back

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
