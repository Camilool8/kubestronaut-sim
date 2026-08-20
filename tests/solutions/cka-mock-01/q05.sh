#!/usr/bin/env bash
set -euo pipefail

KCFG=$HOME/.kube/aux-sched
MANIFEST=/etc/kubernetes/manifests/kube-scheduler.yaml
BAD=--kubeconfig=/etc/kubernetes/scheduler-backup.conf
GOOD=--kubeconfig=/etc/kubernetes/scheduler.conf
NS=default
DEP=orbit-planner
REPLICAS=3

# An aux cluster can be deleted and recreated on the same alias and port between
# attempts, so a stale host key must never be able to fail a correct answer.
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=no
          -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR)

kaux() { kubectl --kubeconfig "$KCFG" "$@"; }

# The whole repair: one flag in the static Pod manifest, corrected in place on
# the node. The kubelet watches that directory and restarts the Pod itself —
# there is nothing to apply, delete or restart afterwards.
ssh "${SSH_OPTS[@]}" cka-aux-sched "sed -i 's|${BAD}|${GOOD}|' ${MANIFEST}"

fixed=$(ssh "${SSH_OPTS[@]}" cka-aux-sched \
  "grep -c -e '${GOOD}\$' ${MANIFEST} || true")
[ "${fixed:-0}" -ge 1 ] || {
  echo "the --kubeconfig flag in $MANIFEST was not restored" >&2
  ssh "${SSH_OPTS[@]}" cka-aux-sched "cat ${MANIFEST}" >&2 || true
  exit 1
}

# Wait for the state the checks read, converged rather than in flight: the
# scheduler container Ready, the leadership Lease taken, and all three Pods
# bound and running. Measured at about 25 s on this image; the bound is
# generous, not expected.
ok=''
for _ in $(seq 1 40); do
  ready=$(kaux -n kube-system get pods -l component=kube-scheduler -o json 2>/dev/null | jq '
    [ .items[]?
      | select(.metadata.deletionTimestamp == null)
      | select(any(.status.conditions[]?; .type == "Ready" and .status == "True")) ] | length' 2>/dev/null) || ready=0

  holder=$(kaux -n kube-system get lease kube-scheduler \
    -o jsonpath='{.spec.holderIdentity}' 2>/dev/null) || holder=''

  running=$(kaux -n "$NS" get pods -l "app=$DEP" -o json 2>/dev/null | jq '
    [ .items[]?
      | select(.metadata.deletionTimestamp == null)
      | select((.spec.nodeName // "") != "")
      | select(.status.phase == "Running")
      | select(any(.status.conditions[]?; .type == "Ready" and .status == "True")) ] | length' 2>/dev/null) || running=0

  if [ "${ready:-0}" -ge 1 ] && [ -n "$holder" ] && [ "${running:-0}" -ge "$REPLICAS" ]; then
    ok=1
    break
  fi
  sleep 3
done

[ -n "$ok" ] || {
  echo "aux-sched did not recover: scheduler Ready=${ready:-0}, lease holder='${holder:-}', $DEP Running=${running:-0}/$REPLICAS" >&2
  kaux -n kube-system get pods >&2 || true
  kaux -n kube-system logs -l component=kube-scheduler --tail=10 >&2 || true
  kaux -n "$NS" get pods -o wide >&2 || true
  exit 1
}
