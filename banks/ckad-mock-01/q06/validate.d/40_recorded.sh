#!/usr/bin/env bash
# points: 1
# desc: the value the container sees for MAX_WORKERS is recorded on the instance
set -uo pipefail
. /banks/_lib/checks.sh
recorded=$(cat /opt/course/6/max-workers 2>/dev/null | tr -d '[:space:]')
[ "$recorded" = "8" ] && echo "recorded ok" || {
  echo "/opt/course/6/max-workers contains '$recorded', want 8"
  show_actual text "$(cat /opt/course/6/max-workers 2>/dev/null)"
  show_why "The question asks for the value the CONTAINER sees, not the value in the ConfigMap — reading it from inside with exec is what proves envFrom actually delivered it. A ConfigMap that is attached but not delivering (a key the kubelet skipped because it is not a legal variable name, a reference to a ConfigMap that does not exist) looks fine from outside and produces nothing in."
  exit 1
}
