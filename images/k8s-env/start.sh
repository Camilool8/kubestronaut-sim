#!/usr/bin/env bash
set -euo pipefail
HELM_REPO_PORT=${HELM_REPO_PORT:-8879}
NODE_IMAGE="${NODE_IMAGE:-$(cat /opt/sim/node-image)}"
# shellcheck source=phase.sh
. /opt/sim/phase.sh
rm -f /shared/ready

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

if [ -f /opt/sim/images/_node.tar ] && ! docker image inspect "${NODE_IMAGE%%@*}" >/dev/null 2>&1; then
  detail "loading the Kubernetes node image"
  docker load -q -i /opt/sim/images/_node.tar >/dev/null
fi

phase helm-repo "Publishing the local Helm repository" 2
mkdir -p /shared/helm-repo
if [ -d /banks/_charts ]; then
  echo "packaging local Helm charts..."
  rm -rf /shared/helm-repo
  mkdir -p /shared/helm-repo
  for chart in /banks/_charts/*/; do
    [ -f "${chart}Chart.yaml" ] || continue
    helm package "$chart" -d /shared/helm-repo >/dev/null
  done
  helm repo index /shared/helm-repo --url "http://k8s-env:${HELM_REPO_PORT}"
fi
httpd -p "${HELM_REPO_PORT}" -h /shared/helm-repo
echo "helm repo on :${HELM_REPO_PORT}"
helm repo add sim "http://k8s-env:${HELM_REPO_PORT}" --force-update >/dev/null 2>&1 || true
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
