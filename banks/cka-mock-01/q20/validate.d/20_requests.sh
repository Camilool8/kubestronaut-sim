#!/usr/bin/env bash
# points: 2
# desc: the api container declares a CPU request and the Pods the Deployment runs carry it
# expected: requests.json json
set -uo pipefail
. /banks/_lib/checks.sh

NS=sagitta
DEP=payments-api

dep=$(kubectl -n "$NS" get deploy "$DEP" -o json 2>/dev/null)
[ -n "$dep" ] || {
  echo "Deployment $DEP not found in Namespace $NS"
  show_actual text "$(kubectl -n "$NS" get deploy 2>/dev/null)"
  show_why "This half of the question is graded on the Deployment payments-api in Namespace sagitta, and the pane above lists what that Namespace actually holds. Resources set on a second Deployment beside it, or on one in another Namespace, are invisible here."
  exit 1
}

names=$(kubectl -n "$NS" get deploy "$DEP" \
  -o jsonpath='{.spec.template.spec.containers[*].name}' 2>/dev/null)
has_name "$names" api || {
  echo "no container named 'api' in deploy/$DEP (found: $(name_list "$names"))"
  show_actual json "$(printf '%s' "$dep" | jq '[.spec.template.spec.containers[]? | {name, image}]' 2>/dev/null)"
  show_why "The question names the container whose CPU request the autoscaler will measure, and this check reads that one. A pane listing another name means the container was renamed, which this question never asked for; an empty pane means the Pod template has no containers at all."
  exit 1
}

# Two reads of the same fact at two depths: what the Pod template asks for, and
# what the Pods the ReplicaSet actually made of it. Pod names are left out —
# they are controller-generated and change under every rollout.
live=$(kubectl -n "$NS" get pod -l app=payments-api -o json 2>/dev/null | jq '
    [ .items[]?
      | select(.metadata.deletionTimestamp == null)
      | .spec.containers[]?
      | select(.name == "api")
      | (.resources.requests // {}) ]' 2>/dev/null)

# Only the authored half — the template's own CPU request. Whether the running
# Pods carry it is a live reading, not a document, and its verdict is already
# carried by that criterion's own message below; a second pane here would
# collide with this one in the UI, which shows one actual/expected pair per
# check, not per criterion.
snapshot() {
  printf '%s' "${dep:-null}" \
    | jq -S '(first(.spec.template.spec.containers[]? | select(.name=="api")) // {})
             | {requests: {cpu: (.resources.requests.cpu // null)}}' 2>/dev/null
}

evidence() {
  show_pair json requests.json
  show_why "$1"
}

tmpl_cpu=$(printf '%s' "$dep" | jq -r '
    [ .spec.template.spec.containers[]?
      | select(.name == "api")
      | .resources.requests.cpu
      | select(. != null) ]
    | join(", ")
    | if . == "" then "<none>" else . end' 2>/dev/null)

n_pods=$(printf '%s' "${live:-[]}" | jq 'length' 2>/dev/null)
n_cpu=$(printf '%s' "${live:-[]}" \
  | jq '[.[] | select(.cpu != null and .cpu != "")] | length' 2>/dev/null)
case ${n_pods:-} in ''|*[!0-9]*) n_pods=0 ;; esac
case ${n_cpu:-} in ''|*[!0-9]*) n_cpu=0 ;; esac

template_requests_cpu() {
  printf '%s' "$dep" | jq -e '
    [ .spec.template.spec.containers[]?
      | select(.name == "api")
      | .resources.requests.cpu ]
    | any(. != null and . != "")' >/dev/null 2>&1
}

pods_request_cpu() { [ "$n_cpu" -ge 1 ]; }

crit 1 "the api container declares a CPU request" \
  "the Pod template's api container requests cpu=$tmpl_cpu" \
  "Average CPU utilization is a ratio, and the request is its denominator: with no requests.cpu there is no percentage to compute, so the autoscaler's target can never be met or missed and it declines to act on that metric at all. Nothing warns you — the HPA is created happily and simply never scales, which is why this is the first thing to check when an autoscaler looks inert. A CPU LIMIT would also have done it, incidentally: Kubernetes copies a limit into the matching request when the request is missing." \
  -- template_requests_cpu

crit 1 "the Pods the Deployment is running carry that request" \
  "$n_cpu of $n_pods running Pods request CPU on their api container" \
  "Resources belong to the Pod TEMPLATE. Chasing the Pods is not the answer: the ordinary update path will not accept a resource change on a running Pod, and even where a cluster permits one it dies with that Pod, because the ReplicaSet builds every replacement from the template again. Only an edit to the Deployment rolls a new ReplicaSet whose Pods carry the request. This criterion reads the Pods' own spec rather than their status, so it does not wait for them to become ready — it asks only whether the template that produced them is the one you edited." \
  -- pods_request_cpu

crit_all_passed || evidence "$(crit_why)"
report "cpu request in place"
