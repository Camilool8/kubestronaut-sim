#!/usr/bin/env bash
# points: 3
# desc: the upgrade really happened, was annotated, and was undone via rollout
set -uo pipefail
# Reaching the right end state by editing the image back would leave two
# revisions; a genuine upgrade-then-undo leaves at least three, and the
# change-cause proves the middle one was the 1.29 upgrade.
rev=$(kubectl -n draco get deploy payments-api \
  -o jsonpath='{.metadata.annotations.deployment\.kubernetes\.io/revision}' 2>/dev/null)
[ -n "$rev" ] && [ "$rev" -ge 3 ] 2>/dev/null \
  || { echo "deployment is at revision '$rev'; an upgrade followed by an undo should reach at least 3"; exit 1; }

causes=$(kubectl -n draco get replicaset -l app=payments-api -o json 2>/dev/null \
  | jq -r '.items[].metadata.annotations["kubernetes.io/change-cause"] // empty')
printf '%s' "$causes" | grep -q 'upgrade to nginx 1.29' \
  && echo "history ok (revision ${rev})" \
  || { echo "no revision recorded the change-cause 'upgrade to nginx 1.29'"; exit 1; }
