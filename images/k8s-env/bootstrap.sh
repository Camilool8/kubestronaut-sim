#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=phase.sh
. /opt/sim/phase.sh
# Every step below is a `set -e` abort waiting to happen: an image pull
# that 404s, a rollout that never completes, a seed script with a typo.
# Without this trap all of them look identical from outside — the marker
# file simply never appears. Naming the failing command is the whole
# difference between "it's still going" and "it died 20 minutes ago".
trap 'boot_failed "step failed: ${BASH_COMMAND} (exit $?)"' ERR
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

# Archive path for a prebaked image, or empty if it was not baked in.
# The transform has to match the one the Dockerfile's preload stage uses.
archive_for() {
  local path="/opt/sim/images/$(printf '%s' "$1" | tr '/:@' '___').tar"
  [ -f "$path" ] && printf '%s' "$path"
}

# Side-loads images into the kind nodes. Prefers an archive baked into
# this image at build time, which needs no network and does not go
# through the inner daemon at all — `kind load image-archive` streams
# straight into each node's containerd. Falls back to the original
# pull-then-load path for anything not prebaked, so a manifest that gains
# an image still works; it is just slower and needs the internet.
load_image() {
  local img=$1 archive
  archive=$(archive_for "$img")
  if [ -n "$archive" ]; then
    kind load image-archive --name sim "$archive" >/dev/null
    return
  fi
  docker image inspect "$img" >/dev/null 2>&1 || {
    echo "pulling ${img}"
    detail "downloading ${img}"
    pull_retry "$img"
  }
  kind load docker-image --name sim "$img" >/dev/null
}

preload_images() {
  local manifest=$1
  for img in $(yq -r '[.. | select(has("image")) | .image] | .[]' "$manifest" | sort -u); do
    load_image "$img"
  done
}

# The workload images the bank's setup.sh scripts and a candidate's own
# answers pull. Without this they come from the internet inside the
# nodes' containerd on every fresh cluster, which is both the slowest
# part of seeding and the part most likely to fail on a flaky link.
preload_bank_images() {
  [ -f /opt/sim/preload.txt ] || return 0
  local img
  while read -r img; do
    case "$img" in ''|\#*) continue ;; esac
    # The node image belongs to the outer daemon, not to a node.
    [ "$img" = "${NODE_IMAGE}" ] && continue
    archive_for "$img" >/dev/null || continue
    load_image "$img"
  done < /opt/sim/preload.txt
}

phase create-cluster "Creating the Kubernetes cluster" 3
created=0
if ! kind get clusters 2>/dev/null | grep -qx sim; then
  # No --wait: with disableDefaultCNI the nodes cannot reach Ready until
  # Calico is installed below, so waiting on readiness here would always
  # time out. The readiness gate moved to after the CNI install.
  # Prebaked archives are loaded under the digest-stripped tag (see
  # start.sh), so ask kind for that ref when one is present. With no
  # archive there is nothing loaded to match, and the digest-pinned ref
  # is both correct and the safer pull.
  node_ref="${NODE_IMAGE}"
  [ -f /opt/sim/images/_node.tar ] && node_ref="${NODE_IMAGE%%@*}"
  kind create cluster --config /opt/sim/kind-config.yaml --image "${node_ref}"
  created=1
fi
kind get kubeconfig --name sim | sed 's#https://0\.0\.0\.0:6443#https://k8s-env:6443#' > /shared/kubeconfig
kind export kubeconfig --name sim   # local admin access via ~/.kube/config

# on warm restart the node containers auto-restart but the API server needs
# time to come back; kubectl wait fails at discovery instead of waiting
phase api-server "Waiting for the API server" 4
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
phase cni "Installing the pod network" 5
echo "installing Calico (NetworkPolicy enforcement)..."
preload_images /opt/sim/calico.yaml
kubectl apply -f /opt/sim/calico.yaml
kubectl -n kube-system rollout status daemonset/calico-node --timeout=300s

# Only now can nodes be Ready — kubelet reports NotReady until a CNI
# plugin is installed, which is exactly what the step above did.
kubectl wait --for=condition=Ready nodes --all --timeout=180s

# The ingress controller uses hostPort 80/443, and only the control-plane
# node carries the matching extraPortMappings, so it has to run there.
phase ingress "Installing the ingress controller" 6
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
phase seed "Setting up the exam questions" 7
if [ "$created" = "1" ]; then
  preload_bank_images
  qids=$(yq -r '.spec.questions[].id' "${BANK_DIR}/exam.yaml")
  total=$(printf '%s\n' "$qids" | grep -c . || true)
  n=0
  # This loop is the longest phase of a cold boot by a wide margin — 22
  # questions, several of them waiting on a rollout or a helm install.
  # Counting through it is the difference between a progress screen that
  # informs and one that just proves the page still renders.
  for qid in $qids; do
    n=$((n + 1))
    echo "seeding ${qid}"
    detail "question ${n} of ${total}"
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
  # One instruction, no platform caveat. The browser intercepts Ctrl+V and
  # Cmd+V identically over the canvas and turns either into the terminal's
  # Ctrl+Shift+V (ui/src/components/DesktopViewport.tsx), so Ctrl+V is
  # true for everyone reading this and there is nothing to qualify.
  echo " Click any value in the question panel to copy it, then paste"
  echo " here with Ctrl+V."
  echo "=============================================================="
} > /shared/exam/motd

phase finalize "Finishing up" 8
touch /shared/ready
# /shared/ready remains the authority every other service gates on; this
# only makes the phase file agree with it, so a reader that has both does
# not have to reconcile them.
boot_ready
