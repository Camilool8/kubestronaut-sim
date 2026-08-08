#!/usr/bin/env bash
# points: 2
# desc: the ReplicaSet count taken while paused was recorded as 1
set -uo pipefail
. /banks/_lib/checks.sh

got=$(file_text /opt/course/31/replicasets-while-paused)

[ "$got" = "1" ] && echo "the paused ReplicaSet count was recorded" || {
  echo "/opt/course/31/replicasets-while-paused contains '$got', want '1'"
  show_actual text "$(cat /opt/course/31/replicasets-while-paused 2>/dev/null)"
  show_why "This number is the evidence that pausing did anything, and it can only be read in the window the question describes: after the image was changed and before the rollout was resumed. There is one ReplicaSet then, because the new Pod template was stored and no controller acted on it. Two means the image was changed before the pause — the rollout had already started and there was nothing left to hold back. An empty file means the count was never taken; resuming first destroys the answer, since the second ReplicaSet exists from that moment on."
  exit 1
}
