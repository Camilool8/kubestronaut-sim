#!/usr/bin/env bash
# points: 3
# desc: ServiceAccount pipeline-runner exists and the pipeline Deployment uses it
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
[ "$sa" = "pipeline-runner" ] || {
  echo "pipeline runs as '$sa', want pipeline-runner"
  show_actual json "$(kubectl -n phoenix get deploy pipeline -o json 2>/dev/null | jq '.spec.template.spec | {serviceAccountName, automountServiceAccountToken}')"
  show_why "serviceAccountName belongs to the POD TEMPLATE, not to the Deployment — it is the Pod that carries an identity, and the Deployment only describes the Pods. Set nowhere, every Pod in the Namespace runs as default and gets that account's token instead."
  exit 1
}

ready=$(kubectl -n phoenix get deploy pipeline -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "$ready" = "1" ] && echo "service account wired up" || {
  echo "readyReplicas is '$ready', want 1"
  show_actual text "$(kubectl -n phoenix get pod 2>/dev/null)"
  show_why "The Deployment names the right identity but has no ready Pod. A Pod that names a ServiceAccount which does not exist in its Namespace never starts — the kubelet has no token to project — so a typo in the name shows up here rather than as an error on the Deployment."
  exit 1
}
