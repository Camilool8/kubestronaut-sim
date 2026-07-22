#!/usr/bin/env bash
set -euo pipefail
echo "waiting for cluster kubeconfig..."
until [ -f /shared/kubeconfig ] && [ -f /shared/ssh/id_ed25519.pub ]; do sleep 2; done
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
echo "instance ready: $(hostname)"
exec /usr/sbin/sshd -D -e
