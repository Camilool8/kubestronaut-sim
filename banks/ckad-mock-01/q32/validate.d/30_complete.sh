#!/usr/bin/env bash
# points: 2
# desc: the rollout finished and all 3 replicas are ready again
set -uo pipefail
. /banks/_lib/checks.sh
KEY=kubectl.kubernetes.io/restartedAt
evidence() {
  show_actual text "$(kubectl -n sagitta get deploy session-store -o wide 2>/dev/null
    echo
    kubectl -n sagitta get pods -l app=session-store 2>/dev/null
    echo
    printf 'template %s: %s\n' "$KEY" "${stamp:-<none>}")"
  show_why "$1"
}

want=$(kubectl -n sagitta get deploy session-store -o jsonpath='{.spec.replicas}' 2>/dev/null)
ready=$(kubectl -n sagitta get deploy session-store -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
updated=$(kubectl -n sagitta get deploy session-store -o jsonpath='{.status.updatedReplicas}' 2>/dev/null)
stamp=$(kubectl -n sagitta get deploy session-store -o json 2>/dev/null \
  | jq -r --arg k "$KEY" '.spec.template.metadata.annotations[$k] // empty')

# A Deployment nobody has touched is already 3-of-3 updated and ready, so both
# counts are read against the restart: it is the restart's rollout that has to
# have finished, and the three ready Pods have to be the ones it made.
restarted() { [ -n "$stamp" ]; }
fully_updated() { restarted && [ -n "$want" ] && [ "$updated" = "$want" ]; }
ready_again() { restarted && [ "$ready" = "3" ]; }

crit 1 "every Pod is on the restarted template" \
  "updatedReplicas is '$updated' of '$want', on a template whose $KEY is '${stamp:-<none>}'" \
  "status.updatedReplicas counts the Pods created from the CURRENT Pod template, and the current template has to be the restarted one — without the restart stamp there has been no rollout to finish and these are the Pods the question asked you to replace. While a rollout is in flight this sits below the replica count, and a rollout that cannot finish — an unschedulable Pod, an image that will not pull — leaves it there permanently rather than reporting an error." \
  -- fully_updated

crit 1 "and all 3 are ready again" \
  "readyReplicas is '$ready' (want 3), on a template whose $KEY is '${stamp:-<none>}'" \
  "'Again' is the word doing the work: three ready replicas is where this Deployment started, so what is graded is three ready Pods AFTER the restart cycled them. A restart is a rolling update, so it respects spec.strategy and takes as long as the Pods take to become ready; cycling them and walking away leaves the workload short-handed, which is the failure this replacement was meant to avoid." \
  -- ready_again

crit_all_passed || evidence "$(crit_why)"
report "rollout complete, 3/3 ready"
