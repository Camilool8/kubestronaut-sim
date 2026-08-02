#!/usr/bin/env bash
# points: 2
# desc: the crash-looping Pod was identified by name
set -uo pipefail
. /banks/_lib/checks.sh
got=$(cat /opt/course/17/crashing-pod 2>/dev/null | tr -d '[:space:]')
[ "$got" = "cache-worker" ] && echo "identified" || {
  echo "/opt/course/17/crashing-pod contains '$got', want cache-worker"
  show_actual text "$(kubectl -n corvus get pod 2>/dev/null)"
  show_why "CrashLoopBackOff is the status of a container that started, exited, and is being restarted with a growing delay between attempts — it is one of the three workloads here and the STATUS column names it outright. The file wants the POD's name, which for a bare Pod is the name you see and for a Deployment's Pod carries the ReplicaSet's random suffix."
  exit 1
}
