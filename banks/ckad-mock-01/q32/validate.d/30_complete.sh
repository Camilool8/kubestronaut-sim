#!/usr/bin/env bash
# points: 2
# desc: the rollout finished and all 3 replicas are ready again
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual text "$(kubectl -n sagitta get deploy session-store -o wide 2>/dev/null
    echo
    kubectl -n sagitta get pods -l app=session-store 2>/dev/null)"
  show_why "$1"
}

want=$(kubectl -n sagitta get deploy session-store -o jsonpath='{.spec.replicas}' 2>/dev/null)
ready=$(kubectl -n sagitta get deploy session-store -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
updated=$(kubectl -n sagitta get deploy session-store -o jsonpath='{.status.updatedReplicas}' 2>/dev/null)

fully_updated() { [ -n "$want" ] && [ "$updated" = "$want" ]; }

crit 1 "every Pod is on the newest template" \
  "updatedReplicas is '$updated' of '$want'" \
  "status.updatedReplicas counts the Pods created from the CURRENT Pod template. While a rollout is in flight it sits below the replica count, and a rollout that cannot finish — an unschedulable Pod, an image that will not pull — leaves it there permanently rather than reporting an error." \
  -- fully_updated

crit 1 "and all 3 are ready" \
  "readyReplicas is '$ready', want 3" \
  "A restart is a rolling update, so it respects spec.strategy and takes as long as the Pods take to become ready. Cycling the Pods and walking away leaves the workload short-handed, which is the failure this replacement was meant to avoid." \
  -- [ "$ready" = "3" ]

crit_all_passed || evidence "$(crit_why)"
report "rollout complete, 3/3 ready"
