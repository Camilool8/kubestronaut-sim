#!/usr/bin/env bash
# points: 2
# desc: 3/3 replicas ready
set -uo pipefail
. /banks/_lib/checks.sh
ready=$(kubectl -n nova get deploy nova-api -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "$ready" = "3" ] && echo "3 ready" || {
  echo "readyReplicas='$ready'"
  show_actual text "$(kubectl -n nova get pod -o wide 2>/dev/null)"
  show_why "status.readyReplicas counts Pods that are running AND passing readiness, so it is what the cluster has rather than what spec.replicas asked for. The STATUS column above names the reason: ImagePullBackOff is a tag that cannot be fetched, and a Running Pod showing 0/1 is failing its readiness probe rather than crashing."
  exit 1
}
