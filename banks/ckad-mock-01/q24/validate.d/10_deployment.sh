#!/usr/bin/env bash
# points: 3
# desc: Deployment report-runner runs 3 ready replicas of the same container, labelled app=report-runner
set -uo pipefail
. /banks/_lib/checks.sh

evidence() {
  show_actual json "$(kubectl -n auriga get deploy report-runner -o json 2>/dev/null \
    | jq '{replicas: .spec.replicas, readyReplicas: .status.readyReplicas,
           labels: .spec.template.metadata.labels,
           containers: [.spec.template.spec.containers[] | {name, image}]}')"
  show_why "$1"
}

want=$(kubectl -n auriga get deploy report-runner -o jsonpath='{.spec.replicas}' 2>/dev/null)
[ -n "$want" ] || {
  echo "there is no Deployment report-runner in auriga"
  show_why "A Deployment is the workload resource for a stateless application that should survive its Pods: it owns a ReplicaSet, the ReplicaSet owns the Pods, and every one of them is recreated when it is lost. 'kubectl create deployment' or a manifest built from the Pod's own spec both get there."
  exit 1
}
[ "$want" = "3" ] || {
  echo "spec.replicas is '$want', want 3"
  evidence "replicas is the desired count the ReplicaSet controller reconciles towards. It is the only thing that decides how many Pods exist; scaling is changing this number and nothing else."
  exit 1
}

names=$(kubectl -n auriga get deploy report-runner \
  -o jsonpath='{range .spec.template.spec.containers[*]}{.name}{"\n"}{end}' 2>/dev/null)
same_set "$names" "report" || {
  echo "the Pod template's containers are '$(printf '%s' "$names" | tr '\n' ' ')', want exactly one named report"
  evidence "The Deployment's spec.template is a Pod spec — the same fields the bare Pod already had, one level down. Copying it across is the conversion; adding or renaming containers is not part of it."
  exit 1
}

img=$(kubectl -n auriga get deploy report-runner \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="report")].image}' 2>/dev/null)
[ "$img" = "busybox:1.37" ] || {
  echo "the report container runs '$img', want busybox:1.37"
  evidence "The workload is meant to be the same application under new management. A different image is a different application, however well the Deployment around it is written."
  exit 1
}

app=$(kubectl -n auriga get deploy report-runner \
  -o jsonpath='{.spec.template.metadata.labels.app}' 2>/dev/null)
[ "$app" = "report-runner" ] || {
  echo "the Pod template's app label is '$app', want report-runner"
  evidence "spec.template.metadata.labels is what goes ON the Pods, and spec.selector.matchLabels is what the ReplicaSet uses to find them. They have to agree — the API server rejects a Deployment whose selector matches nothing in its own template — and the label is also the handle anything else in the Namespace would use to reach these Pods."
  exit 1
}

ready=$(kubectl -n auriga get deploy report-runner -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ -n "$ready" ] || ready=0
[ "$ready" = "3" ] || {
  echo "${ready}/3 replicas are ready"
  show_actual text "$(kubectl -n auriga get pods -l app=report-runner 2>/dev/null)"
  show_why "A Deployment that is declared but not running has not replaced anything. When the count is short, the Pods themselves say why — 'kubectl -n auriga describe pod' on one of them names the constraint it violated, and a securityContext the image cannot satisfy is the usual reason here."
  exit 1
}

echo "deployment ok"
