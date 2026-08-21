#!/usr/bin/env bash
# points: 2
# desc: the scheduler and the controller-manager on aux-upgrade run v1.35.6 or newer too
# expected: none — this grades the image tags kube-scheduler and
#           kube-controller-manager are actually running under right now,
#           read from their live static Pods rather than from a manifest the
#           candidate wrote directly; kubeadm rewrites those manifests
#           itself, so the running image is the only proof the upgrade
#           truly landed rather than being interrupted partway through.
set -uo pipefail
. /banks/_lib/checks.sh

TARGET=v1.35.6
KUBECONFIG_AUX=/home/candidate/.kube/aux-upgrade

aux() { kubectl --kubeconfig "$KUBECONFIG_AUX" --request-timeout=5s "$@"; }

# Every control-plane Pod in one read, selected by the label kubeadm puts on all
# of them rather than by name: the static Pod names carry the node's name, and a
# check has no business knowing that. etcd is in this set too and versions
# independently of Kubernetes, so it is reported but never graded.
pods=$(aux -n kube-system get pods -l tier=control-plane -o json 2>/dev/null)

running=$(printf '%s' "$pods" | jq -r '[.items[]?.spec.containers[]?.image] | sort | unique | join(" ")')

# The tag of the image the named component is running, found by what the image
# IS rather than by a label that may or may not be there.
tag_of() {
  printf '%s' "$pods" | jq -r --arg c "$1" '[.items[]?.spec.containers[]?.image
    | select((split(":") | first) | endswith($c))] | first // "" | split(":") | last'
}

scheduler=$(tag_of kube-scheduler)
controller=$(tag_of kube-controller-manager)

at_least_target() {
  case "$1" in
    v[0-9]*|[0-9]*) ;;
    *) return 1 ;;
  esac
  semver_ge "${1#v}" "${TARGET#v}"
}

both_upgraded() { at_least_target "$scheduler" && at_least_target "$controller"; }

# State only — the target version is in the criterion message, not in here.
evidence() {
  show_actual text "$(printf 'control-plane Pods on aux-upgrade:\n%s\n\nimages: %s\nkube-scheduler: %s\nkube-controller-manager: %s\n' \
    "$(aux -n kube-system get pods -l tier=control-plane 2>&1 | head -c 700)" \
    "${running:-none}" "${scheduler:-not found}" "${controller:-not found}")"
  show_why "$1"
}

crit 1 "scheduler and controller-manager at ${TARGET} or newer" \
  "kube-scheduler is at '${scheduler:-nothing}' and kube-controller-manager at '${controller:-nothing}', want ${TARGET} or newer for both" \
  "A control plane is four static Pods, not one, and 'kubeadm upgrade apply' works through them in order — etcd, apiserver, controller-manager, scheduler — waiting for each to come back before it touches the next. That order is why this criterion exists separately from the apiserver's own version: an upgrade that was interrupted, or one done by hand by editing a single manifest, leaves an apiserver on the new version and these two behind on the old one. A control plane running mixed versions is supported for exactly as long as it takes to finish the upgrade and no longer. etcd appears in this same set and is deliberately not graded: its version follows the Kubernetes release but is written in its own numbering, and kubeadm chooses it for you." \
  -- both_upgraded

crit_all_passed || evidence "$(crit_why)"
report "components upgraded"
