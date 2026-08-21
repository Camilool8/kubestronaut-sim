#!/usr/bin/env bash
# points: 4
# desc: the aux-sched cluster runs a healthy kube-scheduler static Pod and it has taken the scheduling lease
# expected: none — both criteria are live readings of the repaired control
#           plane (the static Pod's phase/readiness, and the Lease's current
#           holderIdentity) rather than a document the candidate authored; the
#           manifest fix itself lives on the aux node's filesystem, out of
#           this check's reach. The messages already name what was seen.
set -uo pipefail
. /banks/_lib/checks.sh

KCFG=/home/candidate/.kube/aux-sched
CLUSTER=aux-sched

# Every read here is an API read against the second cluster's own kubeconfig.
# The request timeout is what keeps a deleted or wrecked aux cluster from
# spending this check's 30s budget on a connect: an unreachable API has to fail
# with evidence, not hang.
kaux() {
  kubectl --kubeconfig "$KCFG" --request-timeout=5s "$@"
}

# Selected by the label kubeadm puts on the manifest, with the name as a
# fallback so an answer that rewrote the file without its labels is still found.
# The name itself is never graded — the kubelet derives it from the node.
sched=$(kaux -n kube-system get pods -o json 2>/dev/null | jq -c '
  [ .items[]?
    | select(.metadata.deletionTimestamp == null)
    | select((.metadata.labels.component == "kube-scheduler")
             or ((.metadata.name // "") | startswith("kube-scheduler")))
    | {pod: .metadata.name,
       source: (.metadata.annotations["kubernetes.io/config.source"] // "the API"),
       phase: .status.phase,
       ready: ([ .status.conditions[]? | select(.type == "Ready") | .status ] | join("")),
       containers: [ .status.containerStatuses[]?
                     | {name: .name,
                        ready: .ready,
                        state: (.state // {} | keys | join(",")),
                        reason: (.state.waiting.reason // .state.terminated.reason // "")} ]} ]' 2>/dev/null)

lease=$(kaux -n kube-system get lease kube-scheduler -o json 2>/dev/null | jq -c '
  {holder: (.spec.holderIdentity // ""), renewed: (.spec.renewTime // "")}' 2>/dev/null)

evidence() {
  show_actual json "$(printf '{"kube-scheduler Pods in kube-system": %s, "Lease kube-system/kube-scheduler": %s}' \
    "${sched:-null}" "${lease:-null}")"
  show_why "$1"
}

# A cluster that answered and has no scheduler Pod returns an empty array, which
# is a real answer and still scores. Nothing at all means the read did not
# happen, and awarding — or explaining — anything from that would be inventing a
# result. This is the shape a deleted aux cluster, a dangling kubeconfig symlink
# or a stopped node container all arrive in.
[ -n "$sched" ] || {
  echo "the $CLUSTER cluster did not answer a read of its kube-system Namespace"
  show_actual text "$(kaux get nodes 2>&1 | head -20)"
  show_why "Everything in this check is read from the $CLUSTER cluster through the kubeconfig at $KCFG, and that request came back with nothing at all — the pane above is what kubectl said when it was asked for that cluster's nodes. This is not a judgement on the repair: the second cluster could not be reached. Check that $KCFG still resolves to a file and that the cluster itself still exists; deleting it is not a way to pass this task, and re-creating it by hand is not one either — a reset re-seeds it."
  exit 1
}

count=$(printf '%s' "${sched:-[]}" | jq 'length' 2>/dev/null)
case ${count:-} in ''|*[!0-9]*) count=0 ;; esac

# The container's own readiness, not just the Pod's phase: a Pod whose only
# container is crash-looping still reports phase Running, so a health criterion
# written on the phase alone scores a scheduler that never starts.
healthy=$(printf '%s' "${sched:-[]}" \
  | jq '[ .[]? | select(.phase == "Running" and .ready == "True"
                        and (.containers | length) > 0
                        and (all(.containers[]; .ready == true))) ] | length' 2>/dev/null)
case ${healthy:-} in ''|*[!0-9]*) healthy=0 ;; esac

state=$(printf '%s' "${sched:-[]}" \
  | jq -r '[ .[]? | .containers[]? | "\(.name): \(.state)\(if .reason == "" then "" else " (\(.reason))" end)" ]
           | join("; ")' 2>/dev/null)

crit 3 "kube-scheduler is Running and Ready on $CLUSTER" \
  "$count kube-scheduler Pod(s) in kube-system, $healthy of them Running and Ready${state:+ — $state}" \
  "A static Pod is started by the node's kubelet straight from a file in /etc/kubernetes/manifests, which is why the scheduler can exist at all on a cluster with no scheduler to place it. The kubelet re-reads that directory by itself within seconds of a file changing, so a corrected manifest needs nothing restarted by hand — and a Pod that comes back in the same state means the file is still wrong. Readiness is the signal here rather than the phase: a container that starts, fails on its own arguments and exits leaves the Pod reported as phase Running while it backs off and retries, with CrashLoopBackOff in its container state. What it said on the way out is in its log, which the API server fetches from the kubelet for you: 'kubectl --kubeconfig $KCFG -n kube-system logs -l component=kube-scheduler --tail=5'." \
  -- [ "$healthy" -ge 1 ]

holder=$(printf '%s' "${lease:-null}" | jq -r '.holder // ""' 2>/dev/null)

crit 1 "a kube-scheduler holds the scheduling lease" \
  "Lease kube-system/kube-scheduler has holderIdentity='${holder:-<none>}'" \
  "kube-scheduler elects a leader before it schedules anything, and it records that in the Lease kube-scheduler in kube-system. The seeded cluster has no such Lease at all — it is cleared when the fault is seeded — so this criterion reads the scheduler that came back rather than the one that ran before it. A scheduler that starts creates the Lease again within a second or two and then renews it continuously, so an empty holder here means the Pod above never reaches the point of doing its job: it is starting and exiting, or it never started at all." \
  -- [ -n "$holder" ]

crit_all_passed || evidence "$(crit_why)"
report "$CLUSTER has a healthy, leading kube-scheduler"
