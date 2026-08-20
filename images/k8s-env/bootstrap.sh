#!/usr/bin/env bash
# -E matters as much as -e here. Without it bash does not inherit the ERR trap
# into shell functions, so a failure inside preload_images, load_image or
# preload_bank_images killed the script under -e without ever reaching
# boot_failed: bootstrap exited 1 while boot.json still read {"state":"booting"},
# and `./sim up` then polled a dead boot until SIM_BOOT_BUDGET expired an hour
# later. The failure has to be recorded, not just suffered.
set -Eeuo pipefail
# shellcheck source=phase.sh
. /opt/sim/phase.sh
trap 'boot_failed "step failed: ${BASH_COMMAND} (exit $?)"' ERR
if [ -f /shared/bank ]; then
  BANK=$(cat /shared/bank)
fi
BANK=${BANK:?BANK env var or /shared/bank required}
BANK_DIR="/banks/${BANK}"
[ -f "${BANK_DIR}/exam.yaml" ] || { echo "no exam.yaml in ${BANK_DIR}"; exit 1; }
NODE_IMAGE="${NODE_IMAGE:-$(cat /opt/sim/node-image)}"
write_shared() {
  cat > "$1.tmp" && mv "$1.tmp" "$1"
}

[ -f /shared/bank ] || printf '%s' "${BANK}" | write_shared /shared/bank

rm -f /shared/ready
mkdir -p /shared/ssh
if [ ! -f /shared/ssh/id_ed25519 ]; then
  keytmp=$(mktemp -d /shared/ssh/.keygen.XXXXXX)
  ssh-keygen -t ed25519 -N '' -f "${keytmp}/id_ed25519" -q
  # Private key first: every consumer gates on the .pub, so once it appears
  # the key it belongs to must already be in place — the instance entrypoint
  # copies the private key for the candidate the moment it sees the .pub.
  mv "${keytmp}/id_ed25519" /shared/ssh/id_ed25519
  mv "${keytmp}/id_ed25519.pub" /shared/ssh/id_ed25519.pub
  rmdir "${keytmp}"
fi

pull_retry() {
  local img=$1 attempt
  for attempt in 1 2 3 4 5; do
    docker pull -q "$img" >/dev/null 2>&1 && return 0
    echo "  pull of ${img} failed (attempt ${attempt}/5), retrying..."
    sleep $((attempt * 5))
  done

  docker pull "$img"
}

archive_for() {
  local path
  path="/opt/sim/images/$(printf '%s' "$1" | tr '/:@' '___').tar"
  if [ -f "$path" ]; then
    printf '%s' "$path"
  fi
}

load_image() {
  local img=$1 archive
  archive=$(archive_for "$img")
  if [ -n "$archive" ]; then
    kind load image-archive --name sim "$archive" >/dev/null
    return
  fi
  docker image inspect "$img" >/dev/null 2>&1 || {
    echo "pulling ${img}"
    detail "downloading ${img}"
    pull_retry "$img"
  }
  kind load docker-image --name sim "$img" >/dev/null
}

preload_images() {
  local manifest=$1
  for img in $(yq -r '[.. | select(has("image")) | .image] | .[]' "$manifest" | sort -u); do
    load_image "$img"
  done
}

preload_bank_images() {
  [ -f /opt/sim/preload.txt ] || return 0
  local img
  while read -r img; do
    case "$img" in ''|\#*) continue ;; esac

    [ "$img" = "${NODE_IMAGE}" ] && continue
    archive_for "$img" >/dev/null || continue
    load_image "$img"
  done < /opt/sim/preload.txt
}

# Cluster infrastructure belongs on the control plane, which is the one node no
# question may break. The CKA bank hands out whole workers — one is drained, one
# has its kubelet disabled, one is tainted for a batch workload — and a
# Deployment the scheduler happened to place on any of them goes down with it.
# That is the correct fate for a candidate's workload and a bug for the storage
# provisioner, whose absence surfaces minutes later as an unrelated question's
# PVC stuck Pending with nothing on screen connecting the two. Observed: the
# Gateway controller booted onto sim-worker3, which is the node q07 disables.
#
# A patch rather than an edit, because both manifests are fetched verbatim at
# build time. Idempotent — patching the same values back reports no change and
# starts no rollout, which is what the resume path needs.
pin_to_control_plane() {
  local ns=$1 deploy=$2
  kubectl -n "$ns" patch deployment "$deploy" -p '{
    "spec": {"template": {"spec": {
      "nodeSelector": {"kubernetes.io/hostname": "sim-control-plane"},
      "tolerations": [{"key": "node-role.kubernetes.io/control-plane",
                       "operator": "Exists", "effect": "NoSchedule"}]
    }}}
  }'
  kubectl -n "$ns" rollout status "deployment/${deploy}" --timeout=180s
}

ingress_prep_pid=""
ingress_prep_log=""

# Neither of these depends on anything Calico does: the label is a scheduling
# hint for a Deployment that does not exist yet, and the preload only fills
# the nodes' image cache. Run them alongside the Calico rollout instead of
# after it, and collect the result at the join point below.
#
# Nothing in here may write to /shared. phase.sh stages every write through
# "${BOOT_FILE}.$$", and $$ is the *parent's* PID inside a subshell, so two
# writers would race on one temp path and on boot.json itself; worse, this
# job's copy of _boot_phase is a fork-time snapshot ("cni"), so a late write
# would drag the UI back to a phase the boot had already left. detail() is
# therefore stubbed out here (it is only reached when an image has to be
# pulled, i.e. when the image was not prebaked). stdout is buffered to a log
# and replayed at the join point, which keeps the container log in exactly
# the order it has always been in.
start_ingress_prep() {
  ingress_prep_log=$(mktemp /tmp/ingress-prep.XXXXXX)
  (
    # Deliberately not the outer trap: boot_failed writes /shared. Name the
    # failing command into the job's own log instead, and let the join point
    # do the reporting.
    trap 'echo "step failed: ${BASH_COMMAND} (exit $?)" >&2' ERR
    detail() { :; }
    kubectl label node sim-control-plane ingress-ready=true --overwrite
    preload_images /opt/sim/ingress-nginx.yaml
  ) > "${ingress_prep_log}" 2>&1 &
  ingress_prep_pid=$!
}

# `set -e` does not reach into a background job and the ERR trap does not fire
# for one, so the status has to be read back by hand: a preload that failed
# silently would surface much later as a question stuck on a cold image cache.
# `wait` hands back the job's own exit status.
finish_ingress_prep() {
  local status=0
  wait "${ingress_prep_pid}" || status=$?
  ingress_prep_pid=""
  cat "${ingress_prep_log}" || true
  rm -f "${ingress_prep_log}"
  if [ "$status" -ne 0 ]; then
    boot_failed "preparing the ingress controller failed (exit ${status}) — see the output above"
    exit 1
  fi
}

nodes=$(yq -r '.spec.environment.nodes // 2' "${BANK_DIR}/exam.yaml")
case "$nodes" in
  ''|*[!0-9]*|0) echo "spec.environment.nodes must be a positive integer, got '${nodes}'"; exit 1 ;;
esac

# Optional addons, read like `nodes` above. Only gateway-api exists; anything
# else is a typo that would otherwise silently install nothing, so it fails
# the boot here, before a cluster is built.
addons=$(yq -r '.spec.environment.addons // [] | .[]' "${BANK_DIR}/exam.yaml")
for addon in $addons; do
  case "$addon" in
    gateway-api) ;;
    *) echo "spec.environment.addons: unknown addon '${addon}' (only gateway-api is recognized)"; exit 1 ;;
  esac
done

kind_config=/tmp/kind-config.yaml
cp /opt/sim/kind-config.yaml "${kind_config}"
worker=1
while [ "$worker" -lt "$nodes" ]; do
  # Worker N's sshd rides host port 2200+N (contract: 2201-2204). Mapped for
  # every bank and every worker count: the node image runs sshd regardless,
  # and a mapping nothing connects to is inert.
  {
    printf '  - role: worker\n'
    printf '    extraPortMappings:\n'
    printf '      - containerPort: 22\n'
    printf '        hostPort: %s\n' "$((2200 + worker))"
    printf '        protocol: TCP\n'
  } >> "${kind_config}"
  worker=$((worker + 1))
done

phase create-cluster "Creating the Kubernetes cluster" 3
created=0
if ! kind get clusters 2>/dev/null | grep -qx sim; then

  node_ref="${NODE_IMAGE}"
  [ -f /opt/sim/images/_node.tar ] && node_ref="${NODE_IMAGE%%@*}"
  echo "creating a ${nodes}-node cluster"
  kind create cluster --config "${kind_config}" --image "${node_ref}"
  created=1
fi
kind get kubeconfig --name sim | sed 's#https://0\.0\.0\.0:6443#https://k8s-env:6443#' | write_shared /shared/kubeconfig
kind export kubeconfig --name sim

# Root ssh onto every node: the node image runs sshd; only the key needs
# injecting. Runs on create AND resume (a fresh /shared may hold a fresh
# keypair), and overwriting makes it idempotent. Twin loop in
# banks/_lib/aux.sh for the aux clusters.
for node in $(kind get nodes --name sim); do
  docker exec -i "$node" sh -c \
    'mkdir -p /root/.ssh && cat > /root/.ssh/authorized_keys && chmod 700 /root/.ssh && chmod 600 /root/.ssh/authorized_keys' \
    < /shared/ssh/id_ed25519.pub
done

phase api-server "Waiting for the API server" 4
echo "waiting for API server..."
for i in $(seq 1 60); do
  kubectl get --raw /readyz >/dev/null 2>&1 && break
  [ "$i" -eq 60 ] && { echo "API server not ready after 180s"; exit 1; }
  sleep 3
done

phase cni "Installing the pod network" 5
echo "installing Calico (NetworkPolicy enforcement)..."
preload_images /opt/sim/calico.yaml
start_ingress_prep
kubectl apply -f /opt/sim/calico.yaml

# NOT `kubectl rollout status`, which waits for a ready Pod on EVERY node the
# DaemonSet is scheduled to. A node a question has deliberately taken down is
# never going to have one — the CKA bank disables a worker's kubelet, and the
# whole point is that `./sim down && ./sim up` must not heal it — so on the
# resume path of an attempt that drew it, rollout status spends its entire
# timeout and then, under `set -e` with an ERR trap, fails the boot of an
# environment behaving exactly as designed. Measured: 4 of 5 ready, boot
# failed, cluster fine.
#
# The condition asked for instead is the one that matters, and it distinguishes
# the two cases without racing either. A node still coming up reports Ready
# `False` ("container runtime network not ready") — every node does, before
# Calico lands. A node whose kubelet has stopped posting reports `Unknown`, and
# only after the node controller's ~45s grace period. So "ready Pods plus nodes
# nobody is hearing from covers every node the DaemonSet wants" is false all the
# way through a normal boot and becomes true, once, at the end of either.
cni_state() { # -> "<desired> <ready> <unknown>"
  local ds unknown
  ds=$(kubectl -n kube-system get daemonset calico-node \
    -o jsonpath='{.status.desiredNumberScheduled} {.status.numberReady}' 2>/dev/null) || ds=""
  unknown=$(kubectl get nodes \
    -o jsonpath='{range .items[*]}{.status.conditions[?(@.type=="Ready")].status}{"\n"}{end}' 2>/dev/null \
    | grep -c '^Unknown$') || unknown=0
  printf '%s %s' "${ds:-0 0}" "${unknown:-0}"
}

# The heal, run once if the wait is not making progress. `./sim down && ./sim
# up` restarts the node containers and the inner docker daemon can hand one a
# different address than it had — with four aux clusters' nodes sharing the
# network, it usually does. A live node posts its new address and Calico
# follows it; a node whose kubelet is disabled cannot, so its stale
# projectcalico.org/IPv4Address annotation goes on claiming an address some live
# node has just been given, and calico/node on THAT node refuses to start at
# all: "conflicting node detected: IPv4 address conflict". Measured on a resume
# of an attempt that had drawn q07 — sim-worker3 was down holding 172.18.0.6,
# the control plane came back on 172.18.0.6, and the cluster booted with no CNI
# on its control plane.
#
# Clearing the down node's annotation releases the address, and costs nothing:
# Calico writes it again from the node's own interface the moment that node's
# Pod runs, which is the moment the candidate repairs the kubelet.
heal_calico_address_conflicts() {
  kubectl get nodes \
    -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.conditions[?(@.type=="Ready")].status}{"\n"}{end}' \
    | awk '$2 == "Unknown" { print $1 }' \
    | while read -r down_node; do
        [ -n "$down_node" ] || continue
        echo "clearing the Calico address annotation of ${down_node}, which nothing is hearing from"
        kubectl annotate node "$down_node" projectcalico.org/IPv4Address- >/dev/null 2>&1 || true
      done
  # And restart whatever could not start because of it: such a Pod is in
  # CrashLoopBackOff, where the next attempt can be minutes away.
  kubectl -n kube-system get pods -l k8s-app=calico-node \
    -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.containerStatuses[*].ready}{"\n"}{end}' \
    | awk '$2 != "true" { print $1 }' \
    | while read -r stuck_pod; do
        [ -n "$stuck_pod" ] || continue
        kubectl -n kube-system delete pod "$stuck_pod" >/dev/null 2>&1 || true
      done
}

echo "waiting for the pod network on every node that is up..."
cni_ok=''
healed=''
cni_desired=0
cni_ready=0
cni_unknown=0
cni_started=$(date +%s)
while :; do
  read -r cni_desired cni_ready cni_unknown <<<"$(cni_state)"
  if [ "${cni_desired:-0}" -gt 0 ] && [ "${cni_ready:-0}" -gt 0 ] \
     && [ $(( cni_ready + cni_unknown )) -ge "${cni_desired:-0}" ]; then
    cni_ok=1
    break
  fi
  # 90s in: the node controller has had its grace period, so a shortfall that
  # is still here is a Pod that cannot start rather than one still starting.
  if [ -z "$healed" ] && [ "$(( $(date +%s) - cni_started ))" -ge 90 ]; then
    healed=1
    heal_calico_address_conflicts
  fi
  [ "$(( $(date +%s) - cni_started ))" -ge 300 ] && break
  sleep 5
done
if [ -n "$cni_ok" ]; then
  if [ "${cni_unknown:-0}" -gt 0 ]; then
    echo "calico-node is ready on all ${cni_ready} node(s) that are up; ${cni_unknown} node(s) are down"
    echo "  — expected when a drawn question has disabled one on purpose"
  fi
else
  echo "calico-node is ready on ${cni_ready} of ${cni_desired} node(s), ${cni_unknown} of which are down"
  kubectl -n kube-system get pods -l k8s-app=calico-node -o wide
  boot_failed "the pod network did not come up on every node that is up"
  exit 1
fi

# Not fatal, and deliberately so on the resume path. A question is allowed to
# leave a node NotReady on purpose — the CKA bank disables a worker's kubelet
# and the whole point is that `./sim down && ./sim up` must not heal it — so
# under `set -e` this wait would spend 180s and then kill a boot that is working
# exactly as designed. It races today: the node controller needs about 45s to
# turn a stale Ready into Unknown, and a fast boot gets here first. Say what is
# NotReady and carry on; nothing after this point needs every node.
if ! kubectl wait --for=condition=Ready nodes --all --timeout=180s; then
  echo "warning: not every node reported Ready — a drawn question may have disabled one on purpose"
  kubectl get nodes
fi

# kind's own storage provisioner, which it installs with the cluster: it
# tolerates the control-plane taint already but is pinned to no node, so which
# one it lands on is luck. Every PVC in every bank is bound by this one Pod.
pin_to_control_plane local-path-storage local-path-provisioner

phase ingress "Installing the ingress controller" 6
echo "installing ingress-nginx..."
finish_ingress_prep
kubectl apply -f /opt/sim/ingress-nginx.yaml
kubectl -n ingress-nginx wait --for=condition=Available \
  deployment/ingress-nginx-controller --timeout=300s

# The gateway-api addon, inside the ingress phase rather than a phase of its
# own: banks without the addon must boot exactly as they always have, and a
# ninth phase would show every one of them a step that no longer matches the
# log. The GatewayClass guard keeps a resume from re-running the NGF
# cert-generator Job, which would mint new agent-TLS secrets under a running
# controller. The CRD applies are server-side because two of the CRDs are far
# past the 262KB client-side-apply annotation limit.
if printf '%s\n' "$addons" | grep -qx 'gateway-api'; then
  if kubectl get gatewayclass sim >/dev/null 2>&1; then
    echo "gateway-api addon already installed; skipping"
  else
    echo "installing the Gateway API controller (nginx-gateway-fabric)..."
    detail "installing the Gateway API controller"
    while read -r img; do
      if [ -n "$img" ]; then load_image "${img%%@*}"; fi
    done < /opt/sim/gateway-images.txt
    kubectl apply --server-side --force-conflicts -f /opt/sim/gateway-api-crds.yaml
    kubectl apply --server-side --force-conflicts -f /opt/sim/ngf-crds.yaml
    kubectl wait --for=condition=Established --timeout=60s \
      crd/gatewayclasses.gateway.networking.k8s.io \
      crd/gateways.gateway.networking.k8s.io \
      crd/httproutes.gateway.networking.k8s.io \
      crd/nginxproxies.gateway.nginx.org \
      crd/nginxgateways.gateway.nginx.org
    kubectl apply -f /opt/sim/ngf.yaml
  fi
  # Outside the guard, on purpose. The skip above is about not reinstalling;
  # placement is decided every boot, or a controller that came up on a worker
  # before this existed would sit there for the life of the volume. It also
  # replaces the old `wait --for=condition=Available`, which proved nothing: a
  # Deployment whose previous Pod is still running satisfies Available while
  # the pinned replacement is still being scheduled.
  #
  # Before the GatewayClass wait, not after, and that ordering is worth a
  # boot's difference. Accepted requires the controller to be up, so pinning
  # after it would always mean a second rollout on a fresh cluster; pinning
  # first means the only Pod NGF ever starts here is the pinned one.
  pin_to_control_plane nginx-gateway nginx-gateway
  kubectl wait --for=condition=Accepted gatewayclass/sim --timeout=120s
fi

exam_type=$(yq -r '.spec.examType // "hands-on"' "${BANK_DIR}/exam.yaml")

exam_length=$(yq -r '.spec.examLength // 0' "${BANK_DIR}/exam.yaml")
pool_size=$(yq -r '.spec.questions | length' "${BANK_DIR}/exam.yaml")
pooled=0
if [ "$exam_length" -gt 0 ] && [ "$exam_length" -lt "$pool_size" ]; then
  pooled=1
fi

# The label is set per branch, not once up front: only the last branch here
# actually seeds anything. A pooled bank draws its questions when an attempt
# starts and seeds them then, and announcing "setting up the exam questions"
# while merely pulling images made that later seed look like a repeat.
if [ "$exam_type" = "mcq" ]; then
  phase seed "Preparing the exam content" 7
  echo "multiple-choice bank; no cluster seeding needed"
  detail "no cluster seeding for a multiple-choice bank"
elif [ "$created" != "1" ]; then
  phase seed "Preparing the exam content" 7
  echo "existing cluster resumed; skipping seed"
elif [ "$pooled" = "1" ]; then
  phase seed "Preloading the exam images" 7
  preload_bank_images
  echo "pooled bank (${exam_length} of ${pool_size}); questions are seeded when an attempt starts"
  detail "questions are set up when you start an attempt"
else
  phase seed "Setting up the exam questions" 7
  preload_bank_images
  qids=$(yq -r '.spec.questions[].id' "${BANK_DIR}/exam.yaml")
  total=$(printf '%s\n' "$qids" | grep -c . || true)
  n=0

  for qid in $qids; do
    n=$((n + 1))
    echo "seeding ${qid}"
    detail "question ${n} of ${total}"
    bash "${BANK_DIR}/${qid}/setup.sh"
  done
fi

mkdir -p /shared/exam
title=$(yq -r '.metadata.title' "${BANK_DIR}/exam.yaml")
if [ "$exam_type" = "mcq" ]; then
  {
    echo "=============================================================="
    echo " ${title}"
    echo "=============================================================="
    echo " This is a multiple-choice exam: answer in the question panel."
    echo " The desktop is not needed for this bank."
    echo "=============================================================="
  } | write_shared /shared/exam/motd
else
  {
    echo "=============================================================="
    echo " ${title}"
    echo "=============================================================="
    echo " Solve questions on the exam instances:"
    for inst in $(yq -r '.spec.instances[].name' "${BANK_DIR}/exam.yaml"); do
      echo "   ssh ${inst}"
    done
    echo " Working directories are pre-created at /opt/course/<n>."
    echo " Firefox is limited to the allowlisted documentation sites."

    echo " Click any value in the question panel to copy it, then paste"
    echo " here with Ctrl+V."
    echo "=============================================================="
  } | write_shared /shared/exam/motd
fi

phase finalize "Finishing up" 8
touch /shared/ready
boot_ready
