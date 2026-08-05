#!/usr/bin/env bash
set -euo pipefail
# Bounded. This loop is the other place in the stack that could print
# "waiting" forever with nothing anywhere to say why — and unlike k8s-env
# these containers have no healthcheck, so compose could not see it
# either. The budget is generous because the thing being waited on is a
# cold cluster bootstrap, but it is finite: a wait that has gone wrong
# should end as a message in the log, not as a container that looks alive
# and does nothing.
# First, wait — without a deadline — for an exam to exist at all.
#
# The budget below exists to turn "a cold bootstrap has gone wrong" into a
# message instead of a container that looks alive and does nothing. That
# is a different situation from "nobody has chosen an exam yet", which is
# a perfectly good state to sit in for an hour, and which no longer has a
# compose health gate holding this container back from reaching it. Timing
# out on it would kill an instance for being correctly idle, and nothing
# would restart it.
if [ ! -s /shared/bank ]; then
  echo "no exam selected yet; waiting for one to be chosen..."
  until [ -s /shared/bank ]; do sleep 2; done
fi

echo "waiting for cluster kubeconfig..."
wait_deadline=$((SECONDS + ${INSTANCE_WAIT_BUDGET:-2400}))
# -s, not -f: a zero-byte file is a file, and the whole failure this
# guards against is copying one. bootstrap.sh now renames both of these
# into place so the window is closed at the source; this stays because a
# reader that accepts an empty kubeconfig hands the candidate a kubectl
# that silently talks to its localhost:8080 default instead of the
# cluster, which is a far worse failure than waiting two more seconds.
until [ -s /shared/kubeconfig ] && [ -s /shared/ssh/id_ed25519.pub ]; do
  if [ "$SECONDS" -ge "$wait_deadline" ]; then
    echo "gave up waiting for /shared/kubeconfig — k8s-env never finished bootstrapping" >&2
    echo "check it with: docker compose logs k8s-env" >&2
    exit 1
  fi
  sleep 2
done
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
# An mcq bank has no per-question working directories — skipping the
# loop avoids creating dozens of empty /opt/course/<n> dirs for
# questions that are answered in the browser.
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

echo "instance ready: ${SIM_HOSTNAME:-$(hostname)}"

# SSHD_LISTEN exists for the hosted deployment, where both instances live
# in one network namespace and would otherwise fight over port 22. All of
# 127.0.0.0/8 routes to loopback, so each instance takes its own address
# and keeps the port — which means `ssh instance-1` and the facilitator's
# sshArgs both keep working with no ssh_config, no -p and no code change.
# Unset under compose, where every instance has a namespace to itself.
set -- /usr/sbin/sshd -D -e
if [ -n "${SSHD_LISTEN:-}" ]; then
  set -- "$@" -o "ListenAddress=$SSHD_LISTEN"
fi

# SIM_HOSTNAME is the same deployment and the next namespace up. A Pod
# shares one UTS namespace across every container, so `hostname` — and
# therefore the shell prompt — reads the Pod's name on the desktop and on
# both instances alike. A candidate who types `ssh instance-1` then sees
# a prompt identical to the one they typed it at, and cannot tell whether
# it worked. On a timed exam that is reason enough on its own; nothing
# else reads the hostname (this file's log line, and no bank content, no
# validate.d check and no Go anywhere).
#
# A private UTS namespace rather than a PS1 override, so `hostname`
# itself becomes correct and anything added later that asks the system
# gets the right answer too. It needs CAP_SYS_ADMIN, which these
# containers already carry for the image builds — so this grants nothing
# new. Probed rather than assumed: an instance that cannot unshare for
# any reason still starts sshd, because failing at the last line of the
# entrypoint would cost the candidate the whole instance to fix a prompt.
#
# Unset under compose, where each container already has a UTS namespace
# of its own and the hostname is already the service name.
if [ -n "${SIM_HOSTNAME:-}" ] && unshare --uts true 2>/dev/null; then
  exec unshare --uts -- sh -c \
    'hostname "$1" || echo "warning: could not set hostname to $1" >&2; shift; exec "$@"' \
    sh "$SIM_HOSTNAME" "$@"
fi
exec "$@"
