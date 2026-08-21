#!/usr/bin/env bash
# points: 3
# desc: the aux-upgrade API server itself serves v1.35.6 or newer
# expected: none — this grades what the aux-upgrade API server reports about
#           itself from /version, a live reading of the running binary
#           rather than a document; a static Pod manifest edited on disk
#           would only prove an edit was made, not that the new apiserver
#           ever came up and started answering.
set -uo pipefail
. /banks/_lib/checks.sh

TARGET=v1.35.6
KUBECONFIG_AUX=/home/candidate/.kube/aux-upgrade

aux() { kubectl --kubeconfig "$KUBECONFIG_AUX" --request-timeout=5s "$@"; }

# The version the apiserver reports about ITSELF, from /version. Not the name of
# a static pod and not the tag written in a manifest on disk: both of those say
# what someone intended, and this says what is running and answering.
served=$(aux version -o json 2>/dev/null | jq -r '.serverVersion.gitVersion // ""' 2>/dev/null)

at_least_target() {
  case "$1" in
    v[0-9]*|[0-9]*) ;;
    *) return 1 ;;
  esac
  semver_ge "${1#v}" "${TARGET#v}"
}

control_plane_upgraded() { at_least_target "$served"; }

# State only — the target version is in the criterion message, not in here.
evidence() {
  show_actual text "$(printf 'what the aux-upgrade API server reports:\n%s\n\nserverVersion.gitVersion: %s\n' \
    "$(aux version 2>&1 | head -c 500)" \
    "${served:-none — nothing answered}")"
  show_why "$1"
}

crit 1 "the API server serves ${TARGET} or newer" \
  "serverVersion.gitVersion is '${served:-nothing — the cluster answered no version at all}', want ${TARGET} or newer" \
  "This is the half of the job kubeadm does and the kubelet cannot: the control plane runs as static Pods whose manifests live in /etc/kubernetes/manifests on the node, and 'kubeadm upgrade apply <version>' rewrites them, waits for each component to come back on the new image, and renews the certificates on the way through. Reading the version from /version rather than from a manifest is deliberate — a manifest that names the new image proves an edit, not a running apiserver, and an apiserver that will not start leaves the old one gone and the new one crash-looping. Nothing answering at all means the same thing from further away: the aux cluster's apiserver is unreachable from here, which it legitimately is for a minute or two in the middle of the upgrade, and permanently if the upgrade broke it. The version the binaries staged on that node install is the one this is measured against, and anything newer counts." \
  -- control_plane_upgraded

crit_all_passed || evidence "$(crit_why)"
report "control plane upgraded"
