#!/usr/bin/env bash
set -euo pipefail

# q13 reference solution: upgrade the one-node aux-upgrade cluster from the
# minor version it was built at to the version staged on its node.
#
# Runs on the question's instance as `candidate`. The node work has to happen on
# the node — a kubelet is a systemd unit and a binary in /usr/bin, neither of
# which the API can reach — and the result is read back through the aux
# kubeconfig, which is where the checks read it too.

TARGET=v1.35.6
KC=/home/candidate/.kube/aux-upgrade
NODE=aux-upgrade-control-plane

# StrictHostKeyChecking/UserKnownHostsFile: an aux cluster can be deleted and
# recreated on the same alias and port between attempts, and a stale host key
# must never be able to fail a correct answer.
node_sh() {
  ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    -o LogLevel=ERROR -o ConnectTimeout=10 -o ServerAliveInterval=30 \
    cka-aux-upgrade "$1"
}

kaux() { kubectl --kubeconfig "$KC" --request-timeout=20s "$@"; }

wait_api() {
  local deadline=$(( $(date +%s) + ${1:-180} ))
  until kaux get --raw /readyz >/dev/null 2>&1; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "the aux-upgrade API never came back" >&2
      return 1
    fi
    sleep 5
  done
}

wait_api 120

# 1. The control plane. kubeadm will not upgrade a cluster past its own version,
#    and the kubeadm installed on this node is the old one, so the staged binary
#    is the one that runs. -y answers the confirmation prompt; there is no
#    terminal on the far end of this to answer it interactively.
#    Takes a couple of minutes: each component is replaced and waited for.
node_sh "/opt/packages/kubeadm upgrade apply ${TARGET} -y"

wait_api 180

# 2. Empty the node before the kubelet underneath it is replaced. This one runs
#    only cluster add-ons and they have nowhere else to go, so they come back at
#    the uncordon below; a failure here must not stop the upgrade, but the
#    uncordon that follows it is not optional.
kubectl --kubeconfig "$KC" --request-timeout=60s drain "$NODE" \
  --ignore-daemonsets --delete-emptydir-data --timeout=90s || true

# 3. The kubelet. The unit is stopped first because Linux refuses to write over
#    the image of a running process — a straight cp answers "Text file busy".
#    (`mv` would work too: a rename replaces the directory entry.) The static
#    Pods keep running while it is stopped; the container runtime, not the
#    kubelet, is what holds them up.
node_sh "systemctl stop kubelet \
  && cp /opt/packages/kubelet /usr/bin/kubelet \
  && cp /opt/packages/kubectl /usr/bin/kubectl \
  && systemctl daemon-reload \
  && systemctl start kubelet"

wait_api 120

# 4. Schedulable again. Nothing clears spec.unschedulable on its own.
kubectl --kubeconfig "$KC" --request-timeout=20s uncordon "$NODE"

# The checks read converged state, so wait for it rather than for the commands
# above to have returned: the node re-registers a few seconds after the kubelet
# comes back, and that re-registration is what carries the new version.
#
# `|| true` on both reads is what makes this a retry loop rather than a single
# attempt. The apiserver is a static Pod that is still being replaced underneath
# these calls, so a refused connection here is the normal first iteration — and
# under `set -e` with `pipefail` an assignment from a failing pipeline is fatal,
# which would kill the script at the exact moment it is supposed to wait.
ok=''
for _ in $(seq 1 40); do
  served=$(kaux version -o json 2>/dev/null | jq -r '.serverVersion.gitVersion // ""' || true)
  state=$(kaux get nodes -o json 2>/dev/null | jq -r '[.items[]?
    | "\(.status.nodeInfo.kubeletVersion // "?")/\(first(.status.conditions[]? | select(.type == "Ready") | .status) // "?")/\(.spec.unschedulable // false)"]
    | join(" ")' || true)
  if [ "$served" = "$TARGET" ] && [ "$state" = "${TARGET}/True/false" ]; then
    ok=1
    break
  fi
  sleep 5
done

[ -n "$ok" ] || {
  echo "aux-upgrade did not converge on ${TARGET}:" >&2
  kaux get nodes -o wide >&2 || true
  kaux version >&2 || true
  kaux -n kube-system get pods -l tier=control-plane >&2 || true
  exit 1
}

kaux get nodes
kaux -n kube-system get pods -l tier=control-plane \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].image}{"\n"}{end}'
