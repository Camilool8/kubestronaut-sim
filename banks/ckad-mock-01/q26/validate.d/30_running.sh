#!/usr/bin/env bash
# points: 2
# desc: the rollout completed and the live Pods carry the new settings
# expected: none — this grades whether the rollout finished (readyReplicas
#           against spec.replicas) and whether the settings 10_pull-policy.sh
#           and 20_grace.sh already pair are actually live on the running
#           Pods, not just on the template. Both are readings taken at a
#           moment — a relationship between the template and the Pods it
#           produced — rather than a shape the candidate authored here.
set -uo pipefail
. /banks/_lib/checks.sh

want=$(kubectl -n volans get deploy edge-cache -o jsonpath='{.spec.replicas}' 2>/dev/null)
ready=$(kubectl -n volans get deploy edge-cache -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ -n "$want" ] || want=0
[ -n "$ready" ] || ready=0
live=$(kubectl -n volans get pods -l app=edge-cache -o json 2>/dev/null \
  | jq -r '[.items[] | select(.spec.terminationGracePeriodSeconds == 45)
            | select([.spec.containers[].imagePullPolicy] | unique == ["Never"])] | length')

grace=$(kubectl -n volans get deploy edge-cache \
  -o jsonpath='{.spec.template.spec.terminationGracePeriodSeconds}' 2>/dev/null)
policies=$(kubectl -n volans get deploy edge-cache \
  -o jsonpath='{.spec.template.spec.containers[*].imagePullPolicy}' 2>/dev/null)

# The seeded Deployment is healthy at 2/2 before the candidate arrives, so a
# bare "2 of 2 are ready" is true of an untouched Namespace. A rollout is only
# evidence of anything once what rolled out is what the question asked for.
template_updated() {
  [ "$grace" = "45" ] || return 1
  [ -n "$policies" ] || return 1
  local p
  for p in $policies; do
    [ "$p" = "Never" ] || return 1
  done
}
rolled_out() { template_updated && [ "$want" -gt 0 ] && [ "$ready" = "$want" ]; }

# "every Pod carries the settings" is vacuously true of no Pods at all, which
# is the state a bank-wide grade with nothing seeded runs in.
every_live_pod_updated() { [ "$ready" -gt 0 ] && [ "$live" = "$ready" ]; }

list_pane() {
  show_actual text "$(kubectl -n volans get pods -l app=edge-cache 2>/dev/null)"
  show_why "$1"
}
template_pane() {
  show_actual json "$(kubectl -n volans get deploy edge-cache -o json 2>/dev/null \
    | jq '{replicas: .spec.replicas, readyReplicas: .status.readyReplicas,
           template: {grace: .spec.template.spec.terminationGracePeriodSeconds,
                      containers: [.spec.template.spec.containers[] | {name, imagePullPolicy}]}}')"
  show_why "$1"
}
settings_pane() {
  show_actual json "$(kubectl -n volans get pods -l app=edge-cache -o json 2>/dev/null \
    | jq '[.items[] | {name: .metadata.name, grace: .spec.terminationGracePeriodSeconds,
                       policies: [.spec.containers[].imagePullPolicy]}]')"
  show_why "$1"
}
pane=''

crit 1 "the template carries both settings and the rollout completed" \
  "the template has terminationGracePeriodSeconds '$grace' and imagePullPolicy '$policies' (want 45, and Never on every container), and ${ready}/${want} replicas are ready" \
  "A template edited but not rolled out has changed nothing that is running — and a Deployment nobody has edited is already 2/2, so the replica count alone says nothing about whether the work was done. ErrImageNeverPull is the failure to expect here: it means the kubelet was told never to pull and could not find the image already on the node, which is exactly what Never is for — a loud failure instead of a silent trip to a registry." \
  -- rolled_out || pane=${pane:-template_pane}

crit 1 "every live Pod carries both settings" \
  "only ${live} of ${ready} running Pods carry both settings — and no Pods at all is not every Pod" \
  "Changing a Deployment's Pod template starts a rollout; it does not edit the Pods that are already there. Until the new ReplicaSet has fully replaced the old one, some of what is running is still the previous spec — 'kubectl -n volans rollout status deploy/edge-cache' is what waits for that." \
  -- every_live_pod_updated || pane=${pane:-settings_pane}

crit_all_passed || "${pane:-list_pane}" "$(crit_why)"
report "rollout complete with both settings live"
