#!/usr/bin/env bash
# points: 2
# desc: the rollout completed and the live Pods carry the new settings
set -uo pipefail
. /banks/_lib/checks.sh

want=$(kubectl -n volans get deploy edge-cache -o jsonpath='{.spec.replicas}' 2>/dev/null)
ready=$(kubectl -n volans get deploy edge-cache -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ -n "$want" ] || want=0
[ -n "$ready" ] || ready=0
live=$(kubectl -n volans get pods -l app=edge-cache -o json 2>/dev/null \
  | jq -r '[.items[] | select(.spec.terminationGracePeriodSeconds == 45)
            | select([.spec.containers[].imagePullPolicy] | unique == ["Never"])] | length')

rolled_out() { [ "$want" -gt 0 ] && [ "$ready" = "$want" ]; }

list_pane() {
  show_actual text "$(kubectl -n volans get pods -l app=edge-cache 2>/dev/null)"
  show_why "$1"
}
settings_pane() {
  show_actual json "$(kubectl -n volans get pods -l app=edge-cache -o json 2>/dev/null \
    | jq '[.items[] | {name: .metadata.name, grace: .spec.terminationGracePeriodSeconds,
                       policies: [.spec.containers[].imagePullPolicy]}]')"
  show_why "$1"
}
pane=''

crit 1 "the rollout completed" \
  "${ready}/${want} replicas are ready" \
  "A template edited but not rolled out has changed nothing that is running. ErrImageNeverPull is the failure to expect here: it means the kubelet was told never to pull and could not find the image already on the node, which is exactly what Never is for — a loud failure instead of a silent trip to a registry." \
  -- rolled_out || pane=${pane:-list_pane}

crit 1 "every live Pod carries both settings" \
  "only ${live} of ${ready} running Pods carry both settings" \
  "Changing a Deployment's Pod template starts a rollout; it does not edit the Pods that are already there. Until the new ReplicaSet has fully replaced the old one, some of what is running is still the previous spec — 'kubectl -n volans rollout status deploy/edge-cache' is what waits for that." \
  -- [ "$live" = "$ready" ] || pane=${pane:-settings_pane}

crit_all_passed || "${pane:-list_pane}" "$(crit_why)"
report "rollout complete with both settings live"
