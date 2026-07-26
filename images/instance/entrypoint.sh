#!/usr/bin/env bash
set -euo pipefail
echo "waiting for cluster kubeconfig..."
until [ -f /shared/kubeconfig ] && [ -f /shared/ssh/id_ed25519.pub ]; do sleep 2; done
# Runtime bank file wins over the compose-time env default; by this point
# k8s-env has finished bootstrapping (kubeconfig exists), so /shared/bank
# is authoritative when present.
if [ -f /shared/bank ]; then
  BANK=$(cat /shared/bank)
fi
mkdir -p /home/candidate/.kube /home/candidate/.ssh /root/.ssh
cp /shared/kubeconfig /home/candidate/.kube/config
cp /shared/ssh/id_ed25519.pub /root/.ssh/authorized_keys
cp /shared/ssh/id_ed25519.pub /home/candidate/.ssh/authorized_keys
chown -R candidate:candidate /home/candidate/.kube /home/candidate/.ssh
chmod 600 /root/.ssh/authorized_keys /home/candidate/.ssh/authorized_keys
# pre-create /opt/course/<n> per question (candidates write into them, never mkdir)
if [ -n "${BANK:-}" ] && [ -f "/banks/${BANK}/exam.yaml" ]; then
  for qid in $(yq -r '.spec.questions[].id' "/banks/${BANK}/exam.yaml"); do
    digits=$(printf '%s' "$qid" | tr -dc '0-9')
    [ -n "$digits" ] || continue
    mkdir -p "/opt/course/$((10#$digits))"
  done
  chown -R candidate:candidate /opt/course
fi

# Pre-add the local chart repository so a Helm question starts where the
# real one does — with a repo already configured — instead of spending the
# candidate's time on `helm repo add`. Non-fatal: k8s-env serves this, and
# a bank with no charts has an empty (but valid) index.
if curl -fsS --max-time 10 -o /dev/null "http://k8s-env:${HELM_REPO_PORT:-8879}/index.yaml" 2>/dev/null; then
  su - candidate -c "helm repo add sim http://k8s-env:${HELM_REPO_PORT:-8879} --force-update >/dev/null && helm repo update >/dev/null" \
    && echo "helm repo 'sim' configured" \
    || echo "warning: could not configure the 'sim' helm repo" >&2
fi

echo "instance ready: $(hostname)"
exec /usr/sbin/sshd -D -e
