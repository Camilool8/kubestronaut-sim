#!/usr/bin/env bash
# points: 4
# desc: the upgrade really happened, was annotated, and was undone via rollout
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual text "$(kubectl -n draco rollout history deploy payments-api 2>/dev/null)"
  show_why "$1"
}

# Reaching the right end state by editing the image back would leave two
# revisions; a genuine upgrade-then-undo leaves at least three, and the
# change-cause proves the middle one was the 1.29 upgrade.
rev=$(kubectl -n draco get deploy payments-api \
  -o jsonpath='{.metadata.annotations.deployment\.kubernetes\.io/revision}' 2>/dev/null)
[ -n "$rev" ] && [ "$rev" -ge 3 ] 2>/dev/null || {
  echo "deployment is at revision '$rev'; an upgrade followed by an undo should reach at least 3"
  evidence "Undoing does not rewind the counter: it rolls a NEW revision forward whose template happens to match an older one. So an upgrade followed by a rollback leaves at least three revisions, while editing the image back to where it started leaves two — same end state, different history, and the history is what the question asked you to use."
  exit 1
}

causes=$(kubectl -n draco get replicaset -l app=payments-api -o json 2>/dev/null \
  | jq -r '.items[].metadata.annotations["kubernetes.io/change-cause"] // empty')
printf '%s' "$causes" | grep -q 'upgrade to nginx 1.29' && echo "history ok (revision ${rev})" || {
  echo "no revision recorded the change-cause 'upgrade to nginx 1.29'"
  evidence "The CHANGE-CAUSE column is an annotation, kubernetes.io/change-cause, and nothing sets it for you — the --record flag that used to is gone. It is copied onto the ReplicaSet that a rollout creates, so it has to be on the Deployment at the time that rollout happens; annotating long afterwards lands it on whichever revision is current then."
  exit 1
}
