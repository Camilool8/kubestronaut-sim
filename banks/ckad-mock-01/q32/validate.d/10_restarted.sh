#!/usr/bin/env bash
# points: 3
# desc: the Pod template records a rollout restart and every Pod came from it
# expected: none — this grades whether a restartedAt annotation is present on
#           the Pod template and on every live Pod, not any specific value:
#           the timestamp kubectl writes is different every run, including
#           between the reference capture and the candidate's own attempt, so
#           there is no single correct document to hold it against. The
#           message and why text already name which half — the template or
#           the Pods — is missing it.
set -uo pipefail
. /banks/_lib/checks.sh
KEY=kubectl.kubernetes.io/restartedAt
evidence() {
  show_actual json "$(kubectl -n sagitta get deploy session-store -o json 2>/dev/null \
    | jq '{templateAnnotations: .spec.template.metadata.annotations}')"
  show_why "$1"
}

kubectl -n sagitta get deploy session-store >/dev/null 2>&1 || {
  echo "Deployment session-store is gone from namespace sagitta"
  show_actual text "$(kubectl -n sagitta get deploy 2>/dev/null)"
  show_why "The task is to cycle this Deployment's Pods in place. Deleting it and creating it again replaces the Pods too, and loses the revision history, the rollback and every field the question said to leave exactly as it was."
  exit 1
}

stamp=$(kubectl -n sagitta get deploy session-store -o json 2>/dev/null \
  | jq -r --arg k "$KEY" '.spec.template.metadata.annotations[$k] // empty')

pods=$(kubectl -n sagitta get pods -l app=session-store -o json 2>/dev/null)
live=$(printf '%s' "$pods" | jq '[.items[] | select(.metadata.deletionTimestamp == null)] | length')
stamped=$(printf '%s' "$pods" | jq --arg k "$KEY" \
  '[.items[] | select(.metadata.deletionTimestamp == null) | select(.metadata.annotations[$k] != null)] | length')

all_from_the_restart() { [ "${live:-0}" -gt 0 ] && [ "$stamped" = "$live" ]; }

pod_pane() {
  show_actual json "$(printf '%s' "$pods" | jq --arg k "$KEY" \
    '[.items[] | {name: .metadata.name, created: .metadata.creationTimestamp, restartedAt: (.metadata.annotations[$k] // null)}]')"
  show_why "$1"
}
pane=''

crit 2 "the Pod template records the restart" \
  "spec.template.metadata.annotations has no $KEY" \
  "There is no restart verb in the Kubernetes API. kubectl makes one by writing a timestamp annotation into the POD TEMPLATE, which is a template change like any other, so the controller rolls the Pods over under spec.strategy. Annotating the Deployment itself instead of its template changes no template, triggers no rollout and replaces no Pod." \
  -- [ -n "$stamp" ] || pane=${pane:-evidence}

crit 1 "and every Pod was created by it" \
  "${stamped:-0} of ${live:-0} Pods carry $KEY" \
  "Pods inherit their template's annotations at creation, so a Pod without this one predates the restart. Editing the template without letting the rollout finish, or deleting Pods by hand alongside it, leaves a mix of old and new — which is exactly the state the question asks you to leave behind." \
  -- all_from_the_restart || pane=${pane:-pod_pane}

crit_all_passed || "${pane:-evidence}" "$(crit_why)"
report "restarted through the Pod template, ${live} Pod(s) from it"
