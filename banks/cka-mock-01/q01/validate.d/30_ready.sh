#!/usr/bin/env bash
# points: 3
# desc: all 3 replicas are Ready and the Deployment reports Available
# expected: none — the check grades whether the Deployment reached its replica
#           count, which is a reading taken at a moment rather than a document
#           the candidate authored. The message already names the count.
set -uo pipefail
. /banks/_lib/checks.sh

ns=orion
dep=telemetry-api

# Status fields, not live Pod arithmetic. A Pod's phase goes Unknown for the
# best part of a minute after the environment is restarted, and grading on that
# would take points off an answer that was already correct.
name=$(kubectl -n "$ns" get deploy "$dep" -o jsonpath='{.metadata.name}' 2>/dev/null)
ready=$(kubectl -n "$ns" get deploy "$dep" -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
avail=$(kubectl -n "$ns" get deploy "$dep" \
  -o jsonpath='{.status.conditions[?(@.type=="Available")].status}' 2>/dev/null)
reason=$(kubectl -n "$ns" get deploy "$dep" \
  -o jsonpath='{.status.conditions[?(@.type=="Available")].message}' 2>/dev/null)

evidence() {
  show_actual text "$(printf '%s\n\n%s\n' \
    "$(kubectl -n "$ns" get pod -l app=telemetry-api 2>/dev/null)" \
    "Available=${avail:-<none>} ${reason:-}")"
  show_why "$1"
}

[ -n "$name" ] || {
  echo "Deployment $dep not found in Namespace $ns"
  show_actual text "$(kubectl -n "$ns" get deploy 2>/dev/null)"
  show_why "Every part of this question is graded on Deployment telemetry-api in Namespace orion, and the pane above lists what that Namespace actually holds. A repair made by creating a second Deployment beside it, or one made in a different Namespace, is invisible to these checks."
  exit 1
}

crit 2 "all 3 replicas are Ready" \
  "readyReplicas is '${ready:-<none>}', want 3" \
  "readyReplicas counts the Pods that are running AND passing their readiness probe, so it is what the cluster has rather than what spec.replicas asked for. The STATUS column above names which of this question's two faults is still in the way: ImagePullBackOff is a tag no registry will serve, while Running at 0/1 with no restarts is a container that is perfectly healthy and failing a probe aimed somewhere it is not listening." \
  -- [ "${ready:-0}" = "3" ]

crit 1 "the Deployment reports Available" \
  "the Available condition is '${avail:-<none>}', want True" \
  "Available is the Deployment's own summary of whether it is serving: it turns True once enough replicas are ready and stays False for as long as a rollout cannot finish. It is what 'kubectl rollout status' waits on, and the message beside it above says what the controller is still waiting for." \
  -- [ "$avail" = "True" ]

crit_all_passed || evidence "$(crit_why)"
report "3/3 ready"
