#!/usr/bin/env bash
# points: 4
# desc: both replicas pass readiness and appear as ready Service endpoints
set -uo pipefail
. /banks/_lib/checks.sh

view='.items[] | del(.metadata.ownerReferences, .metadata.generateName,
                     .metadata.annotations, .metadata.labels)'

probe=$(kubectl -n hydra get deploy orders-api \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].readinessProbe.httpGet.port}' 2>/dev/null)
[ -n "$probe" ] || {
  echo "no readinessProbe is configured, so endpoint readiness proves nothing"
  show_actual json "$(kubectl -n hydra get deploy orders-api -o json 2>/dev/null | jq --arg c api '
    if any(.spec.template.spec.containers[]; .name == $c)
    then first(.spec.template.spec.containers[] | select(.name == $c)) | {startupProbe, readinessProbe, livenessProbe}
    else {"no such container": $c, "containers that exist": [.spec.template.spec.containers[].name]}
    end')"
  show_why "A container with no readinessProbe is considered ready the moment it starts, so its Pod joins the Service's endpoint list whether or not the application can actually serve. That is why the endpoint count below cannot prove anything until the probe exists — on an untouched Deployment it is already 2."
  exit 1
}

ready=$(kubectl -n hydra get deploy orders-api -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "$ready" = "2" ] || {
  echo "readyReplicas is '$ready', want 2"
  show_actual text "$(kubectl -n hydra get pod 2>/dev/null)"
  show_why "readyReplicas counts Pods that are passing readiness, so a probe aimed at the wrong port or path leaves the Pods Running and never ready — no restarts, no errors in the log, just a Deployment that never finishes rolling out. A startupProbe with too small a budget produces the opposite symptom: the container is killed mid-boot and restarts climb."
  exit 1
}

count=$(kubectl -n hydra get endpointslice -l kubernetes.io/service-name=orders-api -o json 2>/dev/null \
  | jq '[.items[].endpoints[]? | select(.conditions.ready == true)] | length')
[ "$count" = "2" ] && echo "2 ready endpoints" || {
  echo "the Service has $count ready endpoints, want 2"
  show_actual yaml "$(kubectl -n hydra get endpointslice -l kubernetes.io/service-name=orders-api -o yaml 2>/dev/null | k8s_clean | yq "$view")"
  show_why "This is the pairing the question is built on: a Pod that fails readiness stays Running and is REMOVED from the Service's endpoints, so traffic stops reaching it without anything being killed. Each address above carries its own ready condition, and the list being shorter than the replica count is that happening."
  exit 1
}
