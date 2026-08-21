#!/usr/bin/env bash
# points: 3
# desc: ServiceAccount pipeline-runner exists and the pipeline Deployment uses it
# expected: serviceaccount.json json
set -uo pipefail
. /banks/_lib/checks.sh
kubectl -n phoenix get serviceaccount pipeline-runner >/dev/null 2>&1 || {
  echo "ServiceAccount pipeline-runner does not exist"
  show_actual text "$(kubectl -n phoenix get serviceaccount 2>/dev/null)"
  show_why "A ServiceAccount is the identity a Pod presents to the API server, and it is namespaced — one of this name in another Namespace is a different identity. Every Namespace already has a 'default' account, which is what a Pod runs as when it names none."
  exit 1
}

sa=$(kubectl -n phoenix get deploy pipeline \
  -o jsonpath='{.spec.template.spec.serviceAccountName}' 2>/dev/null)
ready=$(kubectl -n phoenix get deploy pipeline -o jsonpath='{.status.readyReplicas}' 2>/dev/null)

# serviceAccountName is the only field this check grades — automount is a
# different question's concern. readyReplicas is a live rollout reading and
# rides on its own crit message via pod_pane instead of a second pane.
snapshot() {
  jq -nS --arg sa "${sa:-}" '{serviceAccountName: (if $sa == "" then null else $sa end)}' 2>/dev/null
}

spec_pane() {
  show_pair json serviceaccount.json
  show_why "$1"
}
pod_pane() {
  show_actual text "$(kubectl -n phoenix get pod 2>/dev/null)"
  show_why "$1"
}
pane=''

crit 2 "the pipeline Deployment runs as pipeline-runner" \
  "pipeline runs as '$sa', want pipeline-runner" \
  "serviceAccountName belongs to the POD TEMPLATE, not to the Deployment — it is the Pod that carries an identity, and the Deployment only describes the Pods. Set nowhere, every Pod in the Namespace runs as default and gets that account's token instead." \
  -- [ "$sa" = "pipeline-runner" ] || pane=${pane:-spec_pane}

crit 1 "1 ready replica" \
  "readyReplicas is '$ready', want 1" \
  "The Deployment may name the right identity and still have no ready Pod. A Pod that names a ServiceAccount which does not exist in its Namespace never starts — the kubelet has no token to project — so a typo in the name shows up here rather than as an error on the Deployment." \
  -- [ "$ready" = "1" ] || pane=${pane:-pod_pane}

crit_all_passed || "${pane:-spec_pane}" "$(crit_why)"
report "service account wired up"
