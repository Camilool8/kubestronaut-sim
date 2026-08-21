#!/usr/bin/env bash
# points: 2
# desc: the starting revision and the rollout history were saved on the instance
# expected: revision-before.txt text
set -uo pipefail
. /banks/_lib/checks.sh
before=$(cat /opt/course/12/revision-before 2>/dev/null | tr -d '[:space:]')
hist=$(cat /opt/course/12/history 2>/dev/null)

looks_like_history() {
  printf '%s' "$hist" | grep -q 'REVISION' \
    && printf '%s' "$hist" | grep -q 'upgrade to nginx 1.29'
}

# The starting revision has exactly one correct answer ("1") and is a value
# the candidate copied to disk, so it pairs. The saved history is the live
# output of `kubectl rollout history` at whatever moment it was captured, not
# text the candidate composed, so its outcome rides on its own crit message
# below instead of a second pane.
snapshot() {
  printf '%s' "${before:-}"
}

evidence() {
  show_pair text revision-before.txt
  show_why "$1"
}

crit 1 "the starting revision was recorded" \
  "/opt/course/12/revision-before contains '$before', want 1" \
  "The current revision is an annotation on the Deployment, deployment.kubernetes.io/revision, and it has to be read BEFORE anything changes it — after the upgrade and the rollback it is a different number. The dots in that key are part of the key itself, so a jsonpath has to escape them or it reads the name as nested fields and returns nothing." \
  -- [ "$before" = "1" ]

crit 1 "the rollout history was saved" \
  "/opt/course/12/history does not look like 'kubectl rollout history' output" \
  "What was saved does not carry the REVISION header and the 1.29 change-cause that a full history has. Capturing it before the annotation was set, or from a different Deployment, produces a file that looks plausible and records nothing about the change the question was about — and an empty file means nothing was written to that path at all." \
  -- looks_like_history

crit_all_passed || evidence "$(crit_why)"
report "files ok"
