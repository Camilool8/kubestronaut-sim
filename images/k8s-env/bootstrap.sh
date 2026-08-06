#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=phase.sh
. /opt/sim/phase.sh
trap 'boot_failed "step failed: ${BASH_COMMAND} (exit $?)"' ERR
if [ -f /shared/bank ]; then
  BANK=$(cat /shared/bank)
fi
BANK=${BANK:?BANK env var or /shared/bank required}
BANK_DIR="/banks/${BANK}"
[ -f "${BANK_DIR}/exam.yaml" ] || { echo "no exam.yaml in ${BANK_DIR}"; exit 1; }
NODE_IMAGE="${NODE_IMAGE:-$(cat /opt/sim/node-image)}"
write_shared() {
  cat > "$1.tmp" && mv "$1.tmp" "$1"
}

[ -f /shared/bank ] || printf '%s' "${BANK}" | write_shared /shared/bank

rm -f /shared/ready
mkdir -p /shared/ssh
if [ ! -f /shared/ssh/id_ed25519 ]; then
  keytmp=$(mktemp -d /shared/ssh/.keygen.XXXXXX)
  ssh-keygen -t ed25519 -N '' -f "${keytmp}/id_ed25519" -q
  mv "${keytmp}/id_ed25519.pub" /shared/ssh/id_ed25519.pub
  mv "${keytmp}/id_ed25519" /shared/ssh/id_ed25519
  rmdir "${keytmp}"
fi

pull_retry() {
  local img=$1 attempt
  for attempt in 1 2 3 4 5; do
    docker pull -q "$img" >/dev/null 2>&1 && return 0
    echo "  pull of ${img} failed (attempt ${attempt}/5), retrying..."
    sleep $((attempt * 5))
  done

  docker pull "$img"
}

archive_for() {
  local path
  path="/opt/sim/images/$(printf '%s' "$1" | tr '/:@' '___').tar"
  if [ -f "$path" ]; then
    printf '%s' "$path"
  fi
}

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

preload_bank_images() {
  [ -f /opt/sim/preload.txt ] || return 0
  local img
  while read -r img; do
    case "$img" in ''|\#*) continue ;; esac

    [ "$img" = "${NODE_IMAGE}" ] && continue
    archive_for "$img" >/dev/null || continue
    load_image "$img"
  done < /opt/sim/preload.txt
}

nodes=$(yq -r '.spec.environment.nodes // 2' "${BANK_DIR}/exam.yaml")
case "$nodes" in
  ''|*[!0-9]*|0) echo "spec.environment.nodes must be a positive integer, got '${nodes}'"; exit 1 ;;
esac
kind_config=/tmp/kind-config.yaml
cp /opt/sim/kind-config.yaml "${kind_config}"
worker=1
while [ "$worker" -lt "$nodes" ]; do
  printf '  - role: worker\n' >> "${kind_config}"
  worker=$((worker + 1))
done

phase create-cluster "Creating the Kubernetes cluster" 3
created=0
if ! kind get clusters 2>/dev/null | grep -qx sim; then

  node_ref="${NODE_IMAGE}"
  [ -f /opt/sim/images/_node.tar ] && node_ref="${NODE_IMAGE%%@*}"
  echo "creating a ${nodes}-node cluster"
  kind create cluster --config "${kind_config}" --image "${node_ref}"
  created=1
fi
kind get kubeconfig --name sim | sed 's#https://0\.0\.0\.0:6443#https://k8s-env:6443#' | write_shared /shared/kubeconfig
kind export kubeconfig --name sim

phase api-server "Waiting for the API server" 4
echo "waiting for API server..."
for i in $(seq 1 60); do
  kubectl get --raw /readyz >/dev/null 2>&1 && break
  [ "$i" -eq 60 ] && { echo "API server not ready after 180s"; exit 1; }
  sleep 3
done

phase cni "Installing the pod network" 5
echo "installing Calico (NetworkPolicy enforcement)..."
preload_images /opt/sim/calico.yaml
kubectl apply -f /opt/sim/calico.yaml
kubectl -n kube-system rollout status daemonset/calico-node --timeout=300s

kubectl wait --for=condition=Ready nodes --all --timeout=180s

phase ingress "Installing the ingress controller" 6
echo "installing ingress-nginx..."
kubectl label node sim-control-plane ingress-ready=true --overwrite
preload_images /opt/sim/ingress-nginx.yaml
kubectl apply -f /opt/sim/ingress-nginx.yaml
kubectl -n ingress-nginx wait --for=condition=Available \
  deployment/ingress-nginx-controller --timeout=300s

exam_type=$(yq -r '.spec.examType // "hands-on"' "${BANK_DIR}/exam.yaml")

exam_length=$(yq -r '.spec.examLength // 0' "${BANK_DIR}/exam.yaml")
pool_size=$(yq -r '.spec.questions | length' "${BANK_DIR}/exam.yaml")
pooled=0
if [ "$exam_length" -gt 0 ] && [ "$exam_length" -lt "$pool_size" ]; then
  pooled=1
fi

phase seed "Setting up the exam questions" 7
if [ "$exam_type" = "mcq" ]; then
  echo "multiple-choice bank; no cluster seeding needed"
  detail "no cluster seeding for a multiple-choice bank"
elif [ "$created" != "1" ]; then
  echo "existing cluster resumed; skipping seed"
elif [ "$pooled" = "1" ]; then

  preload_bank_images
  echo "pooled bank (${exam_length} of ${pool_size}); questions are seeded when an attempt starts"
  detail "questions are set up when an attempt starts"
else
  preload_bank_images
  qids=$(yq -r '.spec.questions[].id' "${BANK_DIR}/exam.yaml")
  total=$(printf '%s\n' "$qids" | grep -c . || true)
  n=0

  for qid in $qids; do
    n=$((n + 1))
    echo "seeding ${qid}"
    detail "question ${n} of ${total}"
    bash "${BANK_DIR}/${qid}/setup.sh"
  done
fi

mkdir -p /shared/exam
title=$(yq -r '.metadata.title' "${BANK_DIR}/exam.yaml")
if [ "$exam_type" = "mcq" ]; then
  {
    echo "=============================================================="
    echo " ${title}"
    echo "=============================================================="
    echo " This is a multiple-choice exam: answer in the question panel."
    echo " The desktop is not needed for this bank."
    echo "=============================================================="
  } | write_shared /shared/exam/motd
else
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
    echo " here with Ctrl+V."
    echo "=============================================================="
  } | write_shared /shared/exam/motd
fi

phase finalize "Finishing up" 8
touch /shared/ready
boot_ready
