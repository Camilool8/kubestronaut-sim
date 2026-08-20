#!/usr/bin/env bash
set -euo pipefail

# q13 owns the aux-upgrade cluster and nothing else: no Namespace on the main
# cluster, no reserved worker. Everything this question grades lives on a
# one-node kind cluster of its own, created here one minor version behind the
# rest of the environment.
#
# shellcheck source=../../_lib/aux.sh
. /banks/_lib/aux.sh

CLUSTER=aux-upgrade
NODE=aux-upgrade-control-plane
# kind delete would otherwise reach for $KUBECONFIG — the MAIN cluster's admin
# file, which no question's setup has any business rewriting.
KCFG=/tmp/q13-aux-upgrade.kubeconfig

# Where the cluster must start. Read from the image the helper will boot rather
# than written down twice: aux.sh exports the tag, the k8s-env Dockerfile pins
# the digest, and this question's whole premise is that the two differ by a
# minor version.
START=${AUX_NODE_IMAGE##*:}
case "$START" in
  v[0-9]*) ;;
  *)
    echo "q13 setup: AUX_NODE_IMAGE is '${AUX_NODE_IMAGE:-unset}', which carries no version tag." >&2
    echo "           /opt/sim/aux-node-image is written by images/k8s-env/Dockerfile; without it" >&2
    echo "           this cluster would boot the CURRENT node image and the question would open" >&2
    echo "           already upgraded." >&2
    exit 1
    ;;
esac

# Where the candidate must get to. The version is frozen in three places that
# cannot see each other — this file, question.md and validate.d — so the one
# thing that decides it, the staged image set kubeadm will pull from, is
# checked against it here. A KUBE_UPGRADE_VERSION bump in the Dockerfile then
# fails the seed loudly instead of shipping a question whose target has no
# binaries and no images behind it.
TARGET=v1.35.6
staged=$(awk -F: '/kube-apiserver/ {print $NF}' /opt/sim/upgrade-images.txt 2>/dev/null | head -1)
if [ "$staged" != "$TARGET" ]; then
  echo "q13 setup: the staged upgrade images are for '${staged:-nothing}', but this question," >&2
  echo "           its checks and its question text are written for ${TARGET}." >&2
  echo "           Someone bumped KUBE_UPGRADE_VERSION in images/k8s-env/Dockerfile: update" >&2
  echo "           banks/cka-mock-01/q13 (question.md, solution.md, validate.d) to match." >&2
  exit 1
fi

# An upgraded cluster cannot be un-upgraded, so this is the one question in the
# bank whose re-seed may have to throw its cluster away (authorised in the CKA
# wave-5 addendum, section C). The guard keeps that off the common path: a
# cluster still sitting at its starting version is left exactly where it is,
# which is what makes a warm re-run cheap.
reason=''
if kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  # kind lists a cluster by its container, running or not. After an inner-dockerd
  # restart a node that did not come back on its own has to be nudged before it
  # can answer anything about itself.
  for n in $(kind get nodes --name "$CLUSTER" 2>/dev/null || true); do
    if [ "$(docker inspect -f '{{.State.Running}}' "$n" 2>/dev/null)" != "true" ]; then
      docker start "$n" >/dev/null 2>&1 || true
    fi
  done

  # Read the node, not the API: these three answers arrive in milliseconds and
  # they arrive from a cluster whose apiserver a half-finished upgrade may have
  # left down — which is itself a state this question has to recover from.
  # PATH lookups rather than absolute paths, because a candidate who dropped the
  # new kubeadm into /usr/local/bin has changed what the next `kubeadm` runs.
  kubelet_v=$(docker exec "$NODE" kubelet --version 2>/dev/null | awk '{print $NF}' || true)
  kubeadm_v=$(docker exec "$NODE" kubeadm version -o short 2>/dev/null || true)
  api_img=$(docker exec "$NODE" sh -c \
    "sed -n 's|^ *image: ||p' /etc/kubernetes/manifests/kube-apiserver.yaml" 2>/dev/null || true)

  if [ "$kubelet_v" != "$START" ]; then
    reason="its kubelet is ${kubelet_v:-unreadable}, not ${START}"
  elif [ "$kubeadm_v" != "$START" ]; then
    reason="its kubeadm is ${kubeadm_v:-unreadable}, not ${START}"
  elif [ "${api_img##*:}" != "$START" ]; then
    reason="its kube-apiserver manifest names ${api_img:-nothing}"
  elif ! docker exec "$NODE" sh -c \
      'test -x /opt/packages/kubeadm && test -x /opt/packages/kubelet && test -x /opt/packages/kubectl' \
      >/dev/null 2>&1; then
    reason="the staged ${TARGET} binaries are no longer at /opt/packages"
  fi

  if [ -n "$reason" ]; then
    echo "q13 setup: ${CLUSTER} is not at its starting state (${reason}) — recreating it"
    # kind reads this file to drop the deleted cluster's context out of it, and
    # refuses a path it cannot read at all.
    [ -f "$KCFG" ] || printf 'apiVersion: v1\nkind: Config\n' > "$KCFG"
    kind delete cluster --name "$CLUSTER" --kubeconfig "$KCFG" >/dev/null
  fi
fi

# Cold create measured at ~20s on this image; the warm path returns as soon as
# the API answers. Either way the helper republishes
# /shared/kubeconfig-aux-upgrade, re-asserts the root ssh key, and loads the
# target control-plane images into the node's containerd so the upgrade has
# everything it needs on the node.
aux_up upgrade --image "$AUX_NODE_IMAGE"

# The fresh-environment rule, asserted rather than assumed. Every criterion in
# this question is "at or past ${TARGET}"; a cluster that came up already at the
# current node image would satisfy all of them before the candidate typed
# anything, and `tests/smoke.sh` would fail a whole draw on it.
final=$(docker exec "$NODE" kubelet --version 2>/dev/null | awk '{print $NF}' || true)
if [ "$final" != "$START" ]; then
  echo "q13 setup: ${CLUSTER} came up reporting '${final:-nothing}', expected ${START}." >&2
  echo "           This question is only solvable from one minor version behind ${TARGET};" >&2
  echo "           refusing to seed a cluster that is already there." >&2
  exit 1
fi

echo "q13 setup: ${CLUSTER} ready at ${START}, ${TARGET} binaries staged on the node at /opt/packages"
