#!/usr/bin/env bash
# points: 3
# desc: the upgrade really happened, was annotated, and was undone via rollout
# expected: change-cause.txt text
set -uo pipefail
. /banks/_lib/checks.sh

rev=$(kubectl -n draco get deploy payments-api \
  -o jsonpath='{.metadata.annotations.deployment\.kubernetes\.io/revision}' 2>/dev/null)
causes=$(kubectl -n draco get replicaset -l app=payments-api -o json 2>/dev/null \
  | jq -r '.items[].metadata.annotations["kubernetes.io/change-cause"] // empty')

rolled_forward() { [ -n "$rev" ] && [ "$rev" -ge 3 ] 2>/dev/null; }
recorded_cause() { printf '%s' "$causes" | grep -q 'upgrade to nginx 1.29'; }

# Only the change-cause text is a shape the candidate authored, when they
# annotated the rollout. Which ReplicaSet carries it, and how many revisions
# exist, is a lifecycle reading and rides on its own crit message below —
# sorted because which of possibly several ReplicaSets holds a cause is not
# meaningful order, only whether the right text is present at all.
snapshot() {
  printf '%s' "${causes:-}" | sort
}

evidence() {
  show_pair text change-cause.txt
  show_why "$1"
}

crit 2 "the undo was done through the rollout history" \
  "deployment is at revision '$rev'; an upgrade followed by an undo should reach at least 3" \
  "Undoing does not rewind the counter: it rolls a NEW revision forward whose template happens to match an older one. So an upgrade followed by a rollback leaves at least three revisions, while editing the image back to where it started leaves two — same end state, different history, and the history is what the question asked you to use." \
  -- rolled_forward

crit 2 "the upgrade was annotated with its change-cause" \
  "no revision recorded the change-cause 'upgrade to nginx 1.29'" \
  "The CHANGE-CAUSE column is an annotation, kubernetes.io/change-cause, and nothing sets it for you — the --record flag that used to is gone. It is copied onto the ReplicaSet that a rollout creates, so it has to be on the Deployment at the time that rollout happens; annotating long afterwards lands it on whichever revision is current then." \
  -- recorded_cause

crit_all_passed || evidence "$(crit_why)"
report "history ok (revision ${rev})"
