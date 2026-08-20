#!/usr/bin/env bash
set -euo pipefail

AUX=/home/candidate/.kube/aux-cni
NS=q12-probe
NODE=cka-aux-cni

k() { kubectl --kubeconfig "$AUX" "$@"; }

[ -e "$AUX" ] || {
  echo "no aux-cni kubeconfig at $AUX — the cluster was never seeded" >&2
  exit 1
}

# The manifest is staged on the node and nowhere else, so the answer starts with
# a login. StrictHostKeyChecking/UserKnownHostsFile are off by wave convention:
# an aux cluster is deleted and rebuilt on the same alias and port whenever its
# question is re-seeded, and no host-key bookkeeping may ever be able to fail a
# correct answer.
SSH_OPTS=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null
          -o BatchMode=yes -o ConnectTimeout=10 -o LogLevel=ERROR)

ssh "${SSH_OPTS[@]}" "$NODE" \
  'kubectl --kubeconfig /etc/kubernetes/admin.conf apply -f /opt/packages/calico.yaml'

# The DaemonSet is what writes the CNI configuration onto the node, so it is the
# thing whose readiness the node's own condition follows.
k -n kube-system rollout status daemonset/calico-node --timeout=300s
k wait --for=condition=Ready nodes --all --timeout=180s

for dep in web client outsider; do
  k -n "$NS" rollout status "deploy/$dep" --timeout=240s
done

web_ip=$(k -n "$NS" get pod -l app=web \
  -o jsonpath='{.items[0].status.podIP}')
[ -n "$web_ip" ] || {
  echo "the web Pod has no address" >&2
  k -n "$NS" get pod -o wide >&2 || true
  exit 1
}

# Every probe is bounded twice: busybox's own timeout inside the Pod, because a
# denied packet is dropped rather than refused, and the wget timeout under it.
reaches() { # deployment, url
  k -n "$NS" exec "deploy/$1" -- \
    sh -c "timeout 5 wget -q -T 3 -O /dev/null '$2'" >/dev/null 2>&1
}

# Calico programs the policy a moment after its Pod reports ready, so converge
# rather than asserting once.
ok=''
for _ in $(seq 1 20); do
  if reaches client "http://${web_ip}:8080/" \
    && reaches client "http://web.${NS}.svc.cluster.local:8080/" \
    && ! reaches outsider "http://${web_ip}:8080/"; then
    ok=1
    break
  fi
  sleep 3
done

[ -n "$ok" ] || {
  echo "the pod network did not converge on the expected traffic" >&2
  k get nodes >&2 || true
  k -n kube-system get pod >&2 || true
  k -n "$NS" get pod -o wide >&2 || true
  k -n "$NS" get networkpolicy >&2 || true
  exit 1
}
