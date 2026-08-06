#!/usr/bin/env bash
set -euo pipefail
if [ ! -s /shared/bank ]; then
  echo "no exam selected yet; waiting for one to be chosen..."
  until [ -s /shared/bank ]; do sleep 2; done
fi

echo "waiting for cluster kubeconfig..."
wait_deadline=$((SECONDS + ${INSTANCE_WAIT_BUDGET:-2400}))
until [ -s /shared/kubeconfig ] && [ -s /shared/ssh/id_ed25519.pub ]; do
  if [ "$SECONDS" -ge "$wait_deadline" ]; then
    echo "gave up waiting for /shared/kubeconfig — k8s-env never finished bootstrapping" >&2
    echo "check it with: docker compose logs k8s-env" >&2
    exit 1
  fi
  sleep 2
done
if [ -f /shared/bank ]; then
  BANK=$(cat /shared/bank)
fi
mkdir -p /home/candidate/.kube /home/candidate/.ssh /root/.ssh
cp /shared/kubeconfig /home/candidate/.kube/config
cp /shared/ssh/id_ed25519.pub /root/.ssh/authorized_keys
cp /shared/ssh/id_ed25519.pub /home/candidate/.ssh/authorized_keys
chown -R candidate:candidate /home/candidate/.kube /home/candidate/.ssh
chmod 600 /root/.ssh/authorized_keys /home/candidate/.ssh/authorized_keys
exam_type="hands-on"
if [ -n "${BANK:-}" ] && [ -f "/banks/${BANK}/exam.yaml" ]; then
  exam_type=$(yq -r '.spec.examType // "hands-on"' "/banks/${BANK}/exam.yaml")
fi
if [ "$exam_type" != "mcq" ] && [ -n "${BANK:-}" ] && [ -f "/banks/${BANK}/exam.yaml" ]; then
  for qid in $(yq -r '.spec.questions[].id' "/banks/${BANK}/exam.yaml"); do
    digits=$(printf '%s' "$qid" | tr -dc '0-9')
    [ -n "$digits" ] || continue
    dir="/opt/course/$((10#$digits))"
    mkdir -p "$dir"

    if [ -d "/banks/${BANK}/${qid}/files" ]; then
      cp -Rn "/banks/${BANK}/${qid}/files/." "$dir/" 2>/dev/null || true
    fi
  done
  chown -R candidate:candidate /opt/course
fi

if curl -fsS --max-time 10 -o /dev/null "http://k8s-env:${HELM_REPO_PORT:-8879}/index.yaml" 2>/dev/null; then
  su - candidate -c "helm repo add sim http://k8s-env:${HELM_REPO_PORT:-8879} --force-update >/dev/null && helm repo update >/dev/null" \
    && echo "helm repo 'sim' configured" \
    || echo "warning: could not configure the 'sim' helm repo" >&2
fi

if command -v podman >/dev/null 2>&1; then
  rm -rf /run/netns /run/containers /run/libpod /run/cni /var/lib/cni 2>/dev/null || true
  podman system migrate >/dev/null 2>&1 || true

  for attempt in 1 2 3; do
    podman start --all >/dev/null 2>&1 && break
    [ "$attempt" = "3" ] && echo "warning: could not restart podman containers" >&2
    sleep 2
  done
fi

echo "instance ready: ${SIM_HOSTNAME:-$(hostname)}"

set -- /usr/sbin/sshd -D -e
if [ -n "${SSHD_LISTEN:-}" ]; then
  set -- "$@" -o "ListenAddress=$SSHD_LISTEN"
fi

if [ -n "${SIM_HOSTNAME:-}" ] && unshare --uts true 2>/dev/null; then
  exec unshare --uts -- sh -c \
    'hostname "$1" || echo "warning: could not set hostname to $1" >&2; shift; exec "$@"' \
    sh "$SIM_HOSTNAME" "$@"
fi
exec "$@"
