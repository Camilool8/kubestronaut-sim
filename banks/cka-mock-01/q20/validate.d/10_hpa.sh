#!/usr/bin/env bash
# points: 4
# desc: HorizontalPodAutoscaler payments-api scales the Deployment between 2 and 6 on 50% CPU with a 60s scale-down window
set -uo pipefail
. /banks/_lib/checks.sh

NS=sagitta
HPA=payments-api
DEP=payments-api

# Pinned to autoscaling/v2 rather than the bare short name. An HPA submitted as
# autoscaling/v1 is stored as the same internal object and served back in
# whichever version is asked for, so naming the version here means these
# projections read v2 field names — spec.metrics, spec.behavior — no matter
# which version the candidate wrote.
hpa=$(kubectl -n "$NS" get horizontalpodautoscalers.v2.autoscaling "$HPA" -o json 2>/dev/null)

[ -n "$hpa" ] || {
  echo "HorizontalPodAutoscaler $HPA not found in Namespace $NS"
  show_actual text "$(kubectl -n "$NS" get hpa 2>/dev/null)"
  show_why "Everything this check grades lives on a HorizontalPodAutoscaler called payments-api in Namespace sagitta, and the pane above lists what that Namespace actually holds. An autoscaler under another name, or in another Namespace, is invisible here — and so is a Deployment whose replica count was simply edited by hand, which changes a number without creating anything that would keep changing it."
  exit 1
}

# One projection, five fields. The behavior block is shown whole on purpose:
# the API server fills in everything under it that was not written, so seeing
# the defaults beside the one value that was asked for is the fastest way to
# tell an answer apart from a default.
spec=$(printf '%s' "$hpa" | jq '{
    scaleTargetRef: .spec.scaleTargetRef,
    minReplicas: .spec.minReplicas,
    maxReplicas: .spec.maxReplicas,
    metrics: .spec.metrics,
    behavior: .spec.behavior}' 2>/dev/null)

evidence() {
  show_actual json "${spec:-null}"
  show_why "$1"
}

tgt=$(printf '%s' "$hpa" \
  | jq -r '(.spec.scaleTargetRef.kind // "<none>") + "/" + (.spec.scaleTargetRef.name // "<none>")' 2>/dev/null)
minr=$(printf '%s' "$hpa" | jq -r '.spec.minReplicas // "<none>"' 2>/dev/null)
maxr=$(printf '%s' "$hpa" | jq -r '.spec.maxReplicas // "<none>"' 2>/dev/null)
cpu=$(printf '%s' "$hpa" | jq -r '
    [ .spec.metrics[]?
      | select(.type == "Resource")
      | .resource
      | select(.name == "cpu")
      | (.target.type // "?") + ":"
        + ((.target.averageUtilization // .target.averageValue // "?") | tostring) ]
    | join(", ")
    | if . == "" then "<none>" else . end' 2>/dev/null)
sdw=$(printf '%s' "$hpa" \
  | jq -r '.spec.behavior.scaleDown.stabilizationWindowSeconds // "<none>"' 2>/dev/null)

targets_deployment() {
  printf '%s' "$hpa" | jq -e --arg d "$DEP" \
    '.spec.scaleTargetRef | (.kind == "Deployment") and (.name == $d)' >/dev/null 2>&1
}

range_ok() {
  printf '%s' "$hpa" | jq -e \
    '(.spec.minReplicas == 2) and (.spec.maxReplicas == 6)' >/dev/null 2>&1
}

# any() over a list rather than a fixed index: an HPA may carry several metric
# sources and the CPU one is not obliged to be first.
cpu_target_ok() {
  printf '%s' "$hpa" | jq -e '
    [ .spec.metrics[]?
      | select(.type == "Resource")
      | .resource
      | select(.name == "cpu")
      | select(.target.type == "Utilization")
      | .target.averageUtilization ]
    | any(. == 50)' >/dev/null 2>&1
}

scaledown_ok() {
  printf '%s' "$hpa" \
    | jq -e '.spec.behavior.scaleDown.stabilizationWindowSeconds == 60' >/dev/null 2>&1
}

crit 1 "it scales the Deployment payments-api" \
  "scaleTargetRef is '$tgt', want Deployment/payments-api" \
  "scaleTargetRef is the only thing that ties an autoscaler to a workload, and it is matched by kind and name rather than by labels: an HPA next to the right Deployment but pointing at another object scales that other object. The target has to expose the scale subresource, which is why Deployments, StatefulSets and ReplicaSets can be autoscaled and a bare Pod or a DaemonSet cannot." \
  -- targets_deployment

crit 1 "the replica range is 2 to 6" \
  "minReplicas is '$minr' and maxReplicas is '$maxr', want 2 and 6" \
  "maxReplicas is required; minReplicas is optional and defaults to 1, so an HPA written without it silently permits a single replica. The range is also the one part of an autoscaler that works without any metric at all: the controller clamps the replica count into it before it ever asks for a measurement." \
  -- range_ok

crit 1 "average CPU utilization is targeted at 50%" \
  "the Resource metric on cpu reads '$cpu', want Utilization:50" \
  "A resource metric can be targeted two ways and they are not interchangeable. Utilization takes a PERCENTAGE of the container's request, written as averageUtilization; AverageValue takes an absolute quantity such as 500m, written as averageValue. The question asks for the percentage, which is the one that needs a request to be a percentage of." \
  -- cpu_target_ok

crit 1 "scale-down stabilization is 60 seconds" \
  "behavior.scaleDown.stabilizationWindowSeconds is '$sdw', want 60" \
  "This field exists only in autoscaling/v2 — v1 has no behavior block at all, and no kubectl autoscale flag writes one in either version, so it is the part of the answer that always has to be added by hand. Read the pane above carefully before assuming an edit was lost: the moment behavior is set to anything, the API server fills in every rule underneath it that was left out, so an object holding a scaleUp block and a scaleDown policy nobody typed is showing defaults rather than a mistake. The stabilization window is what stops the autoscaler acting on a dip: it scales down only to the highest replica count it recommended within the last window, which is 300 seconds when nothing says otherwise." \
  -- scaledown_ok

crit_all_passed || evidence "$(crit_why)"
report "autoscaler configured"
