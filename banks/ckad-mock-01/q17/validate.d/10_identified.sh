#!/usr/bin/env bash
# points: 2
# desc: the crash-looping Pod was identified by name
# expected: crashing-pod.txt text
set -uo pipefail
. /banks/_lib/checks.sh

snapshot() {
  cat /opt/course/17/crashing-pod 2>/dev/null
}

evidence() {
  show_pair text crashing-pod.txt
  show_why "$1"
}

got=$(cat /opt/course/17/crashing-pod 2>/dev/null | tr -d '[:space:]')
[ "$got" = "cache-worker" ] && echo "identified" || {
  echo "/opt/course/17/crashing-pod contains '$got', want cache-worker"
  evidence "CrashLoopBackOff is the status of a container that started, exited, and is being restarted with a growing delay between attempts — running 'kubectl -n corvus get pod' names it outright in the STATUS column, and it is one of the three workloads here. The file wants the POD's name, which for a bare Pod is the name you see and for a Deployment's Pod carries the ReplicaSet's random suffix."
  exit 1
}
