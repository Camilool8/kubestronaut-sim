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
# and seed any starting material the question ships.
#
# The seeding lives here rather than in setup.sh because setup.sh runs on
# k8s-env, which has no access to these per-instance volumes — so a
# question that hands the candidate a broken manifest, a Dockerfile to
# edit or a kustomize base had no way to deliver it. Files are copied for
# EVERY question, not just this instance's: a bank is free to move a
# question between instances, and copying a few kilobytes twice is
# cheaper than a question whose material silently isn't there.
if [ -n "${BANK:-}" ] && [ -f "/banks/${BANK}/exam.yaml" ]; then
  for qid in $(yq -r '.spec.questions[].id' "/banks/${BANK}/exam.yaml"); do
    digits=$(printf '%s' "$qid" | tr -dc '0-9')
    [ -n "$digits" ] || continue
    dir="/opt/course/$((10#$digits))"
    mkdir -p "$dir"
    # Seeded once, never overwritten: -n keeps whatever the candidate has
    # already edited. `down` + `up` is documented to resume an attempt, and
    # these files ARE the attempt for a question that hands over a
    # Dockerfile or a kustomize overlay — re-copying would silently throw
    # the work away. A reset is the thing that clears them, by wiping
    # /opt/course first, after which this seeds fresh copies.
    if [ -d "/banks/${BANK}/${qid}/files" ]; then
      cp -Rn "/banks/${BANK}/${qid}/files/." "$dir/" 2>/dev/null || true
    fi
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

# Reconcile podman across a container restart.
#
# Podman keeps runtime state under /run (network namespaces, lock files)
# and CNI keeps its IP allocations under /var/lib/cni. On a real host
# both are on tmpfs and vanish at boot, which is the assumption podman is
# built on. Inside a container they survive `docker restart` instead, so
# podman comes back holding records that point at network namespaces and
# iptables chains that no longer exist — and then fails *every* command,
# including `podman ps`, not just the stale one. The candidate's whole
# container toolchain is dead until someone wipes the volume.
#
# Clearing it restores that boot-time assumption, and `start --all` then
# brings back whatever was running, which is what a restart policy does
# on a real machine. All best-effort: an instance whose podman has never
# been used has none of these paths.
if command -v podman >/dev/null 2>&1; then
  rm -rf /run/netns /run/containers /run/libpod /run/cni /var/lib/cni 2>/dev/null || true
  podman system migrate >/dev/null 2>&1 || true
  # Retried: the first start immediately after clearing the CNI state
  # loses a race with podman rebuilding its default bridge, and fails
  # with "could not set bridge's mac". The second attempt succeeds.
  for attempt in 1 2 3; do
    podman start --all >/dev/null 2>&1 && break
    [ "$attempt" = "3" ] && echo "warning: could not restart podman containers" >&2
    sleep 2
  done
fi

echo "instance ready: $(hostname)"
exec /usr/sbin/sshd -D -e
