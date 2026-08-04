#!/usr/bin/env bash
set -euo pipefail
HELM_REPO_PORT=${HELM_REPO_PORT:-8879}
# This script is PID 1, so it does have the image's ENV — unlike
# bootstrap.sh when a hosted reset re-runs it over ssh. Resolved the same
# way anyway, so there is one rule rather than two. See bootstrap.sh.
NODE_IMAGE="${NODE_IMAGE:-$(cat /opt/sim/node-image)}"
# shellcheck source=phase.sh
. /opt/sim/phase.sh
rm -f /shared/ready   # clear stale marker before healthcheck can see it

phase dockerd "Starting the container runtime" 1
dockerd-entrypoint.sh &
dockerd_pid=$!
# Bounded, and guarded on the daemon still being alive. This loop used to
# be `until docker info; do sleep 1; done` with neither: a dockerd that
# died on startup left it spinning forever, the container Running, and
# /shared/ready never appearing — the exact shape of "stuck at waiting"
# that has no error anywhere. The desktop image's entrypoint already had
# the kill -0 guard; this is the same idea plus a deadline, because a
# daemon that is alive but wedged is the case kill -0 misses.
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

# The kind node image has to live in THIS daemon's store, not in a node's
# containerd — there is no node yet when `kind create cluster` runs. It is
# prebaked into the image as an archive (see the Dockerfile) because
# /var/lib/docker is a named volume and is therefore empty on first boot,
# which is what used to make first boot a ~900MB download. Loading is
# skipped once the volume is warm, so only the very first boot pays.
#
# Loaded under the digest-stripped tag on purpose. A docker-archive does
# not carry the repo digest, so a `kind create --image tag@sha256:...`
# would ignore the loaded copy and go to the network regardless — the
# same trap the Dockerfile documents for the ingress manifest. The
# pinning is not lost: skopeo fetched it *by* digest at build time, which
# is where the verification belongs. bootstrap.sh picks the matching ref.
if [ -f /opt/sim/images/_node.tar ] && ! docker image inspect "${NODE_IMAGE%%@*}" >/dev/null 2>&1; then
  detail "loading the Kubernetes node image"
  docker load -q -i /opt/sim/images/_node.tar >/dev/null
fi

# The local chart repository is built and served BEFORE bootstrap runs,
# because bootstrap seeds the questions and a Helm question's setup.sh
# installs releases from this repo. Packaging here rather than in
# bootstrap also means the httpd is started exactly once: bootstrap
# re-runs on every reset and bank switch while this container keeps
# running, and a second httpd would just fail to bind.
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
# Reachable by name from here too, so a question's setup.sh can install
# from the repo exactly as a candidate would.
helm repo add sim "http://k8s-env:${HELM_REPO_PORT}" --force-update >/dev/null 2>&1 || true
helm repo update >/dev/null 2>&1 || true

# Deliberately NOT fatal to the container. bootstrap.sh traps its own
# errors into the phase file, so by the time we get here the UI can
# already say what broke; staying alive means the conductor's
# recreate-cluster phase can still exec a retry in here, which is what
# the "New attempt" button drives. Exiting would take that away and
# leave the candidate with nothing but a restart loop.
# Only in the hosted deployment, where the stack is one Kubernetes Pod:
# the conductor has no Docker socket there and execs in here over ssh
# (ENGINE=ssh). Unset under compose, where the socket is the route and
# nothing should be listening.
#
# The address is explicit because the Pod shares one network namespace
# with the instances, which take 127.0.0.2 and 127.0.0.3. Binding
# 0.0.0.0 here would take :22 on every address and lock them out.
#
# Called after bootstrap.sh because that is what generates the key pair
# this authorises, and on the failure path too so a broken environment is
# still reachable for diagnosis.
start_control_sshd() {
  [ -n "${SSHD_LISTEN:-}" ] || return 0
  # -s, not -f, to match the instance and desktop entrypoints: an empty
  # authorized_keys authorises nobody, and this would then start an sshd
  # the conductor can never log into — a working-looking listener that
  # refuses every connection. Unreachable now that bootstrap.sh renames
  # the key into place, and kept because that is exactly the assumption
  # this file should not be making again.
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

if ! /opt/sim/bootstrap.sh; then
  start_control_sshd
  echo "bootstrap failed; holding the container open so the failure is visible and retryable" >&2
  tail -f /dev/null
fi

start_control_sshd
echo "k8s-env ready"
tail -f /dev/null
