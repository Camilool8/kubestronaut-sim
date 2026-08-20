#!/usr/bin/env bash
# points: 2
# desc: the network plugin's DaemonSet is rolled out on every node and the seeded q12-probe workload is Running
set -uo pipefail
. /banks/_lib/checks.sh

AUX=/home/candidate/.kube/aux-cni
NS=q12-probe

# kube-proxy is the one DaemonSet a CNI-less kind cluster already carries, so it
# is excluded: what is being looked for here is something somebody installed.
# The name of that something is deliberately not graded — a plugin is judged by
# being rolled out on every node, which is the shape every CNI DaemonSet shares.
ds=$(kubectl --kubeconfig "$AUX" --request-timeout=5s -n kube-system get daemonset -o json 2>/dev/null \
  | jq '[ .items[]?
          | select(.metadata.name != "kube-proxy")
          | {name: .metadata.name,
             desired: (.status.desiredNumberScheduled // 0),
             ready: (.status.numberReady // 0),
             available: (.status.numberAvailable // 0)} ]' 2>/dev/null)

# Pod names are read for the pane and never graded: a ReplicaSet generates them
# and they change under every restart of this environment.
pods=$(kubectl --kubeconfig "$AUX" --request-timeout=5s -n "$NS" get pod -o json 2>/dev/null \
  | jq '[ .items[]?
          | select(.metadata.deletionTimestamp == null)
          | {app: (.metadata.labels.app // ""),
             phase: (.status.phase // ""),
             ready: ([ .status.conditions[]? | select(.type == "Ready") | .status ] | join("")),
             reason: ([ .status.containerStatuses[]?.state.waiting.reason ] | join(","))} ]' 2>/dev/null)

evidence() {
  show_actual json "$(printf '{"DaemonSets in kube-system besides kube-proxy": %s, "Pods in %s": %s}' \
    "${ds:-null}" "$NS" "${pods:-null}")"
  show_why "$1"
}

# An empty STRING here is kubectl having failed outright — a dangling kubeconfig,
# an API that did not answer — while an empty LIST is a cluster that answered and
# has nothing. The two deserve different messages, and scoring the second as if
# it were the first would blame the candidate for an unreachable cluster.
[ -n "$ds" ] && [ -n "$pods" ] || {
  echo "the aux-cni cluster did not answer"
  evidence "Both halves of this check are read from the aux-cni cluster through the kubeconfig at ~/.kube/aux-cni, and the request did not come back at all. Nothing about the pod network is being judged here; the cluster could not be read. That kubeconfig is a symlink into the shared volume, so it is empty when the cluster was never built or has since been deleted — this task installs a plugin into the cluster that is there rather than replacing it."
  exit 1
}

# Ready against desired, and deliberately not numberAvailable as well: the two
# differ only for the moment minReadySeconds covers, and a criterion that can
# fail a correct answer for one second is worse than no criterion. desired >= 1
# is the vacuity guard — a DaemonSet scheduled nowhere trivially has every Pod
# it wants.
rolled=$(printf '%s' "${ds:-[]}" \
  | jq -r '[ .[] | select(.desired >= 1 and .ready == .desired) | .name ] | join(", ")' 2>/dev/null)

# What is there instead, for a message that can name the real problem: a
# DaemonSet applied moments ago and a DaemonSet that will never come up look
# identical in a listing, and 0/1 ready is the difference.
found=$(printf '%s' "${ds:-[]}" \
  | jq -r '[ .[] | "\(.name) \(.ready)/\(.desired) ready" ] | join("; ")' 2>/dev/null)

running=$(printf '%s' "${pods:-[]}" \
  | jq -r '[ .[] | select(.phase == "Running" and .ready == "True") | .app ] | unique | join(" ")' 2>/dev/null)

workload_running() {
  has_name "$running" web && has_name "$running" client && has_name "$running" outsider
}

crit 1 "a pod-network DaemonSet is rolled out on every node" \
  "no DaemonSet outside kube-proxy is fully rolled out in kube-system (found: ${found:-none})" \
  "A network plugin runs as a DaemonSet because every node needs its own copy: the Pod writes the CNI configuration and the plugin binaries onto the node it lands on, then stays to program the dataplane. Rolled out means numberReady equals desiredNumberScheduled — a DaemonSet that exists with zero ready has installed nothing anywhere, which is the state right after the manifest is applied and before the Pod comes up. Watch it converge with 'kubectl -n kube-system rollout status daemonset/<name>' rather than guessing; on this cluster the images are already in the node's containerd, so nothing here is waiting on a download." \
  -- [ -n "$rolled" ]

crit 1 "the seeded q12-probe workload is Running" \
  "Running and Ready: ${running:-none}, want web, client and outsider" \
  "These three Deployments were seeded before the cluster had a pod network, so their Pods have been Pending since: the node was NotReady, it carried node.kubernetes.io/not-ready:NoSchedule, and the scheduler had nowhere to put them. They are the proof that the network works — a plugin whose DaemonSet is up but whose dataplane is not leaves Pods stuck in ContainerCreating with a sandbox that never gets an address. Nothing here asks you to create, edit or restart them; they start on their own within seconds of the node going Ready. If one is in ImagePullBackOff instead, note that its image was staged into the node's container store when the cluster was built rather than published anywhere, so the fix is not a pull." \
  -- workload_running

crit_all_passed || evidence "$(crit_why)"
report "the pod network is installed and the probe workload is up"
