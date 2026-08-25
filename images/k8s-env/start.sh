#!/usr/bin/env bash
set -euo pipefail
HELM_REPO_PORT=${HELM_REPO_PORT:-8879}
NODE_IMAGE="${NODE_IMAGE:-$(cat /opt/sim/node-image)}"
# shellcheck source=phase.sh
. /opt/sim/phase.sh
rm -f /shared/ready

# A kind node's kubelet calls inotify_init for cAdvisor and its cert
# watcher; a nested node container gets its own copy of these limits at
# the moment `docker run` creates it, frozen from then on — raising them
# on an ALREADY-RUNNING node does nothing. This must happen before `kind
# create cluster` creates any node, not after. Measured live: cka-mock-01
# building five nodes at once (up to nine with aux clusters) exhausted
# the kernel default of 128 instances, and every one of the five crashed
# forever on "Failed to start cAdvisor: inotify_init: too many open
# files" — never once became healthy, so kubeadm's kubelet-check always
# hit its own 4-minute deadline. Recreating a node after raising these
# fixed it on the spot. 8192/524288 is what was verified live to let a
# fresh node's kubelet start clean; kind's own docs recommend 512/524288
# for multi-node setups, but this bank can stack aux clusters on top of
# the main five, so the instance ceiling is padded well past that.
echo 8192 > /proc/sys/fs/inotify/max_user_instances
echo 524288 > /proc/sys/fs/inotify/max_user_watches

phase dockerd "Starting the container runtime" 1
dockerd-entrypoint.sh &
dockerd_pid=$!
dockerd_deadline=$((SECONDS + 180))
until docker info >/dev/null 2>&1; do
  if ! kill -0 "$dockerd_pid" 2>/dev/null; then
    boot_failed "the inner Docker daemon exited before it became ready — check 'docker compose logs k8s-env'"
    tail -f /dev/null
  fi
  if [ "$SECONDS" -ge "$dockerd_deadline" ]; then
    boot_failed "the inner Docker daemon did not become ready within 180s"
    tail -f /dev/null
  fi
  sleep 1
done
echo "inner dockerd up"

# The node tars are rootfs exports of the ssh-enabled derived images (see the
# node-ssh stages in the Dockerfile), not docker archives — a derived build
# stage cannot be `docker save`d from inside its own build. `docker import`
# rebuilds the image from the tar, and the .changes file baked next to it
# restores the original image config (ENTRYPOINT, ENV, STOPSIGNAL) that a
# rootfs tar cannot carry. Twin of _aux_import_node_tar in banks/_lib/aux-cluster.sh,
# which lazily imports the v1.34 aux tar the same way.
import_node_tar() {
  local tar=$1 ref=$2 line
  local args=()
  while IFS= read -r line; do
    if [ -n "$line" ]; then args+=(--change "$line"); fi
  done < "${tar}.changes"
  docker import "${args[@]}" "$tar" "$ref" >/dev/null
}

# The guard checks the sim.node-ssh label, not bare tag existence: the inner
# dockerd's volume outlives image upgrades, so a pre-ssh install has the same
# tag pointing at the pristine upstream image, and a tag-only guard would keep
# it forever. Importing over the tag untags the stale one; the running cluster
# still needs one reset/switch to rebuild its nodes from the new image.
node_image_current() {
  [ "$(docker image inspect -f '{{index .Config.Labels "sim.node-ssh"}}' "$1" 2>/dev/null)" = "1" ]
}
if [ -f /opt/sim/images/_node.tar ] && ! node_image_current "${NODE_IMAGE%%@*}"; then
  detail "loading the Kubernetes node image"
  import_node_tar /opt/sim/images/_node.tar "${NODE_IMAGE%%@*}"
fi

HELM_REPO_URL="http://k8s-env:${HELM_REPO_PORT}"
HELM_REPO_STAMP=/shared/helm-repo/.charts-stamp

# Everything the packaged repository is derived from, in one hash: the chart
# sources (content and path, so an edit, a rename, an addition and a deletion
# all move it), the URL baked into index.yaml by `helm repo index`, and the
# helm that did the packaging — /shared outlives the image, so an upgraded
# helm must not keep serving the old repo's output. Anything unreadable
# hashes to a value that simply will not match the stamp, and an unmatched
# stamp only ever means "rebuild".
charts_fingerprint() {
  {
    printf 'url=%s\n' "${HELM_REPO_URL}"
    helm version --short 2>/dev/null || echo "helm=unknown"
    find /banks/_charts -type f -exec sha256sum {} + 2>/dev/null || true
  } | sort | sha256sum | cut -d' ' -f1
}

phase helm-repo "Publishing the local Helm repository" 2
mkdir -p /shared/helm-repo
if [ -d /banks/_charts ]; then
  want=$(charts_fingerprint)
  # The stamp is written last and lives *inside* the directory it describes,
  # so it cannot outlive the thing it vouches for: the rebuild wipes the
  # directory first, and a rebuild that dies part-way leaves no stamp at all.
  # index.yaml is checked too, because that is the one file helm actually
  # fetches and the only one not produced by `helm package`.
  if [ -f /shared/helm-repo/index.yaml ] && [ "$(cat "${HELM_REPO_STAMP}" 2>/dev/null || true)" = "$want" ]; then
    echo "local Helm charts unchanged; reusing the packaged repository"
  else
    echo "packaging local Helm charts..."
    rm -rf /shared/helm-repo
    mkdir -p /shared/helm-repo
    for chart in /banks/_charts/*/; do
      [ -f "${chart}Chart.yaml" ] || continue
      helm package "$chart" -d /shared/helm-repo >/dev/null
    done
    helm repo index /shared/helm-repo --url "${HELM_REPO_URL}"
    printf '%s\n' "$want" > "${HELM_REPO_STAMP}.tmp" && mv "${HELM_REPO_STAMP}.tmp" "${HELM_REPO_STAMP}"
  fi
fi
httpd -p "${HELM_REPO_PORT}" -h /shared/helm-repo
echo "helm repo on :${HELM_REPO_PORT}"
helm repo add sim "${HELM_REPO_URL}" --force-update >/dev/null 2>&1 || true
helm repo update >/dev/null 2>&1 || true

start_control_sshd() {
  [ -n "${SSHD_LISTEN:-}" ] || return 0

  if [ ! -s /shared/ssh/id_ed25519.pub ]; then
    echo "control sshd: no shared key yet, not starting" >&2
    return 0
  fi
  mkdir -p /root/.ssh
  cp /shared/ssh/id_ed25519.pub /root/.ssh/authorized_keys
  chmod 700 /root/.ssh
  chmod 600 /root/.ssh/authorized_keys
  ssh-keygen -A >/dev/null 2>&1
  /usr/sbin/sshd -e -o "ListenAddress=$SSHD_LISTEN" -o PermitRootLogin=prohibit-password \
    && echo "control sshd on ${SSHD_LISTEN}:22"
}

selected=""
if [ -s /shared/bank ]; then
  selected=$(cat /shared/bank)
elif [ -n "${BANK:-}" ]; then
  selected="$BANK"
fi

if [ -z "$selected" ]; then
  boot_idle
  start_control_sshd
  tail -f /dev/null
fi

if ! /opt/sim/bootstrap.sh; then
  start_control_sshd
  echo "bootstrap failed; holding the container open so the failure is visible and retryable" >&2
  tail -f /dev/null
fi

start_control_sshd
echo "k8s-env ready"
tail -f /dev/null
