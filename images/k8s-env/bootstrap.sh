#!/usr/bin/env bash
set -euo pipefail
# Runtime bank file wins over the compose-time env default. k8s-env owns
# first-boot creation of /shared/bank; the conductor rewrites it on a
# bank switch (then re-runs this script), so a warm `./sim up <other>`
# deliberately keeps the active bank — switching is the conductor's job.
if [ -f /shared/bank ]; then
  BANK=$(cat /shared/bank)
fi
BANK=${BANK:?BANK env var or /shared/bank required}
BANK_DIR="/banks/${BANK}"
[ -f "${BANK_DIR}/exam.yaml" ] || { echo "no exam.yaml in ${BANK_DIR}"; exit 1; }
[ -f /shared/bank ] || printf '%s' "${BANK}" > /shared/bank

rm -f /shared/ready
mkdir -p /shared/ssh
[ -f /shared/ssh/id_ed25519 ] || ssh-keygen -t ed25519 -N '' -f /shared/ssh/id_ed25519 -q

# Side-loads a manifest's images into the kind nodes from the DinD image
# cache, which lives on a named volume and therefore survives resets. The
# first boot pulls from the internet; every reset after that is offline
# and skips a few hundred megabytes of re-download inside the nodes.
#
# Retried, because `docker pull` does not retry the way containerd does
# and this is several hundred megabytes from registries that time out
# under load. A single transient TLS handshake failure used to take down
# the entire boot — one flaky second, and the candidate gets no cluster.
pull_retry() {
  local img=$1 attempt
  for attempt in 1 2 3 4 5; do
    docker pull -q "$img" >/dev/null 2>&1 && return 0
    echo "  pull of ${img} failed (attempt ${attempt}/5), retrying..."
    sleep $((attempt * 5))
  done
  # Last try, unsilenced, so the real registry error reaches the log and
  # the conductor's progress detail rather than a bare exit code.
  docker pull "$img"
}

preload_images() {
  local manifest=$1
  for img in $(yq -r '[.. | select(has("image")) | .image] | .[]' "$manifest" | sort -u); do
    docker image inspect "$img" >/dev/null 2>&1 || {
      echo "pulling ${img}"
      pull_retry "$img"
    }
    kind load docker-image --name sim "$img" >/dev/null
  done
}

created=0
if ! kind get clusters 2>/dev/null | grep -qx sim; then
  # No --wait: with disableDefaultCNI the nodes cannot reach Ready until
  # Calico is installed below, so waiting on readiness here would always
  # time out. The readiness gate moved to after the CNI install.
  kind create cluster --config /opt/sim/kind-config.yaml --image "${NODE_IMAGE}"
  created=1
fi
kind get kubeconfig --name sim | sed 's#https://0\.0\.0\.0:6443#https://k8s-env:6443#' > /shared/kubeconfig
kind export kubeconfig --name sim   # local admin access via ~/.kube/config

# on warm restart the node containers auto-restart but the API server needs
# time to come back; kubectl wait fails at discovery instead of waiting
echo "waiting for API server..."
for i in $(seq 1 60); do
  kubectl get --raw /readyz >/dev/null 2>&1 && break
  [ "$i" -eq 60 ] && { echo "API server not ready after 180s"; exit 1; }
  sleep 3
done

# Cluster networking. Applied on every bootstrap, not just a fresh
# cluster: both manifests are declarative and re-applying them on a warm
# restart is a no-op, which is cheaper than remembering whether a past
# boot got this far.
echo "installing Calico (NetworkPolicy enforcement)..."
preload_images /opt/sim/calico.yaml
kubectl apply -f /opt/sim/calico.yaml
kubectl -n kube-system rollout status daemonset/calico-node --timeout=300s

# Only now can nodes be Ready — kubelet reports NotReady until a CNI
# plugin is installed, which is exactly what the step above did.
kubectl wait --for=condition=Ready nodes --all --timeout=180s

# The ingress controller uses hostPort 80/443, and only the control-plane
# node carries the matching extraPortMappings, so it has to run there.
echo "installing ingress-nginx..."
kubectl label node sim-control-plane ingress-ready=true --overwrite
preload_images /opt/sim/ingress-nginx.yaml
kubectl apply -f /opt/sim/ingress-nginx.yaml
kubectl -n ingress-nginx wait --for=condition=Available \
  deployment/ingress-nginx-controller --timeout=300s

# The local Helm repository is packaged and served by start.sh, before
# this script runs — a Helm question's setup.sh installs releases from
# it, so it has to exist by the time seeding starts.

# seed only a freshly created cluster — re-seeding a resumed one would
# overwrite candidate work (setup.sh scripts re-apply initial state)
if [ "$created" = "1" ]; then
  for qid in $(yq -r '.spec.questions[].id' "${BANK_DIR}/exam.yaml"); do
    echo "seeding ${qid}"
    bash "${BANK_DIR}/${qid}/setup.sh"
  done
else
  echo "existing cluster resumed; skipping seed"
fi

# regenerate the desktop's login banner for the active bank (consumed by
# the desktop image's .bashrc; regenerated on every bootstrap so a bank
# switch or reset updates it)
mkdir -p /shared/exam
title=$(yq -r '.metadata.title' "${BANK_DIR}/exam.yaml")
{
  echo "=============================================================="
  echo " ${title}"
  echo "=============================================================="
  echo " Solve questions on the exam instances:"
  for inst in $(yq -r '.spec.instances[].name' "${BANK_DIR}/exam.yaml"); do
    echo "   ssh ${inst}"
  done
  echo " Working directories are pre-created at /opt/course/<n>."
  echo " Firefox is limited to the allowlisted documentation sites."
  echo " Click any value in the question panel to copy it, then paste"
  echo " here with Ctrl+Shift+V."
  echo "=============================================================="
} > /shared/exam/motd

touch /shared/ready
