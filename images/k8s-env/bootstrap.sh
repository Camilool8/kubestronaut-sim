#!/usr/bin/env bash
set -euo pipefail
BANK=${BANK:?BANK env var required}
BANK_DIR="/banks/${BANK}"
[ -f "${BANK_DIR}/exam.yaml" ] || { echo "no exam.yaml in ${BANK_DIR}"; exit 1; }

rm -f /shared/ready
mkdir -p /shared/ssh
[ -f /shared/ssh/id_ed25519 ] || ssh-keygen -t ed25519 -N '' -f /shared/ssh/id_ed25519 -q

if ! kind get clusters 2>/dev/null | grep -qx sim; then
  kind create cluster --config /opt/sim/kind-config.yaml --image "${NODE_IMAGE}" --wait 180s
fi
kind get kubeconfig --name sim | sed 's#https://0\.0\.0\.0:6443#https://k8s-env:6443#' > /shared/kubeconfig
kind export kubeconfig --name sim   # local admin access via ~/.kube/config
kubectl wait --for=condition=Ready nodes --all --timeout=180s

for qid in $(yq -r '.spec.questions[].id' "${BANK_DIR}/exam.yaml"); do
  echo "seeding ${qid}"
  bash "${BANK_DIR}/${qid}/setup.sh"
done

touch /shared/ready
