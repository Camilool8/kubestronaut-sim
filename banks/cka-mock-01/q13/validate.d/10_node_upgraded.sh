#!/usr/bin/env bash
# points: 4
# desc: the aux-upgrade node runs kubelet v1.35.6 or newer, is Ready, and was left schedulable
set -uo pipefail
. /banks/_lib/checks.sh

TARGET=v1.35.6
KUBECONFIG_AUX=/home/candidate/.kube/aux-upgrade

# A second cluster, read from this instance. Three things can be wrong with it
# and none of them may hang the check: the kubeconfig is a symlink into /shared
# that dangles when the cluster was never created, the apiserver is down for a
# minute in the middle of any control-plane upgrade, and a candidate is free to
# wreck the node outright. --request-timeout bounds the whole call — connect
# included — far inside the 30s deadline, and every criterion below simply reads
# false when nothing answers.
aux() { kubectl --kubeconfig "$KUBECONFIG_AUX" --request-timeout=5s "$@"; }

nodes=$(aux get nodes -o json 2>/dev/null)

# One line per node, which is what the candidate needs to see: the version it
# reports, whether it is Ready, and whether it is still cordoned.
summary=$(printf '%s' "$nodes" | jq -r '[.items[]?
  | "\(.metadata.name): kubelet \(.status.nodeInfo.kubeletVersion // "unknown"), Ready=\(first(.status.conditions[]? | select(.type == "Ready") | .status) // "unknown")\(if (.spec.unschedulable // false) then ", SchedulingDisabled" else ", schedulable" end)"]
  | join("; ")')

versions=$(printf '%s' "$nodes" | jq -r '[.items[]? | .status.nodeInfo.kubeletVersion // "unknown"] | join(" ")')
not_ready=$(printf '%s' "$nodes" | jq -r '[.items[]?
  | select((first(.status.conditions[]? | select(.type == "Ready") | .status) // "unknown") != "True")
  | .metadata.name] | join(" ")')
cordoned=$(printf '%s' "$nodes" | jq -r '[.items[]? | select(.spec.unschedulable // false) | .metadata.name] | join(" ")')

# The floor, not the exact string. `kubeadm upgrade plan` advertises whatever
# patch release it can see, so a candidate who followed it past the staged
# version has still done the exercise; a candidate who has not started is still
# a whole minor version below. Anything that is not a version at all — a node
# that answered nothing, a cluster that answered nothing — fails here rather
# than sorting as "greater than".
at_least_target() {
  case "$1" in
    v[0-9]*|[0-9]*) ;;
    *) return 1 ;;
  esac
  semver_ge "${1#v}" "${TARGET#v}"
}

every_kubelet_upgraded() {
  local v
  [ -n "$versions" ] || return 1
  for v in $versions; do
    at_least_target "$v" || return 1
  done
  return 0
}

upgraded_and_ready() { every_kubelet_upgraded && [ -z "$not_ready" ]; }
upgraded_and_schedulable() { every_kubelet_upgraded && [ -z "$cordoned" ]; }

# Both halves of this criterion can be the reason it failed, and reporting the
# cordon when nothing is cordoned would send the candidate after the wrong one.
if [ -n "$cordoned" ]; then
  schedulable_msg="node ${cordoned} is still cordoned (SchedulingDisabled)"
else
  schedulable_msg="nothing is cordoned, but the kubelet upgrade above has not landed either: ${summary:-the cluster answered nothing at all}"
fi

# The pane is what the cluster says and nothing else. What was wanted belongs
# in the criterion messages below, where the candidate reads it beside the
# verdict it explains; printing it inside "your cluster state" made the two
# impossible to tell apart.
evidence() {
  show_actual text "$(printf 'aux-upgrade nodes:\n%s\n\nas the API reports them: %s\n' \
    "$(aux get nodes -o wide 2>&1 | head -c 700)" \
    "${summary:-nothing — the cluster answered nothing at all}")"
  show_why "$1"
}

crit 3 "kubelet at ${TARGET} or newer, and the node Ready" \
  "the node reports ${summary:-nothing at all}, want kubelet ${TARGET} or newer and Ready=True" \
  "kubeletVersion is the kubelet's own answer, reported to the apiserver when it registers and refreshed as it re-registers, so it changes only once the new binary is the one actually running. Replacing the file is half the job: the running process keeps its old image until the unit is restarted, and until then the node still advertises the version it started with. Ready is graded alongside it because an upgrade that leaves the kubelet dead — a binary that will not exec, a unit that was stopped and never started again — also stops the version ever changing, and the two failures read identically from a distance. If the whole line is missing, nothing answered at all: the cluster's apiserver is part of what is being upgraded and it is down for part of the job." \
  -- upgraded_and_ready

crit 1 "the upgraded node left schedulable" \
  "$schedulable_msg" \
  "Draining the node before the kubelet is replaced is the documented step, and it sets spec.unschedulable — which nothing clears on its own. A cordoned node is Ready, reports the new version, and refuses every Pod the scheduler offers it, which on a one-node cluster means the cluster runs nothing new at all. Uncordon is the last line of the procedure for exactly that reason. This criterion is worth one point and the version is worth three: forgetting it is a small mistake, but it is the mistake that leaves a cluster upgraded and useless." \
  -- upgraded_and_schedulable

crit_all_passed || evidence "$(crit_why)"
report "node upgraded"
