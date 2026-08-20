#!/usr/bin/env bash
set -euo pipefail

NS=q07-probe
NODE=sim-worker3
HOST=cka-worker3
DEP=node-probe

# StrictHostKeyChecking/UserKnownHostsFile: the node containers are recreated on
# the same alias and port across a rebuild, so a stale host key must never be
# able to fail a correct answer. BatchMode keeps a broken key from sitting at a
# password prompt until the harness times out.
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=5
          -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null)

# enable AND start, which is what --now buys: the unit was left stopped and
# disabled, so starting it alone would fix the node until its next boot and
# leave the enablement criterion failed.
fixed=''
for _ in $(seq 1 10); do
  if ssh "${SSH_OPTS[@]}" "$HOST" 'systemctl enable --now kubelet' >/dev/null 2>&1; then
    fixed=1
    break
  fi
  sleep 3
done

[ -n "$fixed" ] || {
  echo "q07: could not enable the kubelet on $HOST" >&2
  ssh "${SSH_OPTS[@]}" "$HOST" 'systemctl status kubelet --no-pager' >&2 || true
  exit 1
}

# Wait for the state the checks read, not for the command to return. The node
# posts its status within a few seconds of the kubelet starting, and the probe
# Pod — already assigned to this node and Pending since the outage — starts
# straight afterwards from the image already in the node's containerd.
ok=''
for _ in $(seq 1 40); do
  ready=$(kubectl get node "$NODE" \
    -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)

  pod=$(kubectl -n "$NS" get pod -l "app=$DEP" -o json 2>/dev/null | jq -r --arg n "$NODE" '
    [ .items[]? | select(.metadata.deletionTimestamp == null)
                | select(.spec.nodeName == $n and .status.phase == "Running")
                | .metadata.name ] | first // ""' 2>/dev/null || true)

  if [ "$ready" = "True" ] && [ -n "$pod" ]; then
    # The grader proves the node is really serving by execing into this Pod, so
    # the reference solution is not finished until that works either.
    if kubectl -n "$NS" exec "$pod" -c probe \
         -- ls /host-units/multi-user.target.wants >/dev/null 2>&1; then
      ok=1
      break
    fi
  fi
  sleep 3
done

[ -n "$ok" ] || {
  echo "q07: $NODE did not come back Ready with $DEP running on it" >&2
  kubectl get nodes >&2 || true
  kubectl -n "$NS" get pod -o wide >&2 || true
  ssh "${SSH_OPTS[@]}" "$HOST" 'systemctl status kubelet --no-pager' >&2 || true
  exit 1
}

units=$(kubectl -n "$NS" exec "$pod" -c probe \
  -- ls /host-units/multi-user.target.wants 2>/dev/null || true)

case " $(printf '%s' "$units" | tr '\n' ' ') " in
  *' kubelet.service '*) ;;
  *)
    echo "q07: the kubelet unit is not linked into multi-user.target on $NODE" >&2
    printf 'linked units: %s\n' "$units" >&2
    exit 1
    ;;
esac
